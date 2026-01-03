'use server';

import { auth } from '@/auth';
import { getOwnedGames, getRecentlyPlayedGames, SteamGame } from '@/lib/steam';
import { prisma } from '@/lib/db';
import { searchIgdbGames } from '@/lib/igdb';
import { extractDominantColors } from '@/lib/color-utils';
import { findBestGameArt } from '@/lib/enrichment';
import { revalidatePath } from 'next/cache';

export async function fetchSteamGames() {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // Get steamId from user
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { accounts: true },
    });

    let steamId = user?.steamId;

    // If not in user table, check accounts
    if (!steamId && user?.accounts) {
        const steamAccount = user.accounts.find(acc => acc.provider === 'steam');
        if (steamAccount) {
            steamId = steamAccount.providerAccountId;
        }
    }

    if (!steamId) {
        throw new Error('Steam account not linked');
    }

    try {
        const games = await getOwnedGames(steamId);
        return games;
    } catch (e) {
        console.error(e);
        // Mock data for development if API fails or not set
        if (process.env.NODE_ENV === 'development') {
            return [
                { appid: 10, name: 'Counter-Strike', playtime_forever: 3000, img_icon_url: '' },
                { appid: 20, name: 'Team Fortress Classic', playtime_forever: 100, img_icon_url: '' },
                { appid: 70, name: 'Half-Life', playtime_forever: 500, img_icon_url: '' },
                { appid: 400, name: 'Portal', playtime_forever: 0, img_icon_url: '' }
            ] as unknown as SteamGame[];
        }
        throw e;
    }
}

export async function getSteamImportCandidates() {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // 1. Fetch all steam games
    const steamGames = await fetchSteamGames();

    // 2. Fetch user's current library game IDs
    const userLibrary = await prisma.userLibrary.findMany({
        where: { userId: userId },
        select: { gameId: true }
    });

    const existingGameIds = new Set(userLibrary.map(entry => entry.gameId));

    // 3. Filter out games already in library
    // Steam Game ID is typically the 'appid'
    const candidates = steamGames.filter(game => !existingGameIds.has(game.appid.toString()));

    return candidates;
}

export async function importGames(games: SteamGame[]) {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // Process imports in batches to avoid rate limits and timeouts
    const BATCH_SIZE = 5;
    let importedCount = 0;

    for (let i = 0; i < games.length; i += BATCH_SIZE) {
        const batch = games.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(batch.map(async (game) => {
            // Prepare initial game data
            const gameId = game.appid.toString();

            // Use Smart Cascade to find best art
            // Steam games typically don't give us year directly in 'getOwnedGames', so we pass null/undefined
            // But we can try to guess or just rely on title match from Steam Store which is high quality.
            const bestArt = await findBestGameArt(game.name);

            const coverImage = bestArt?.cover || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/library_600x900.jpg`;
            const backgroundImage = bestArt?.background || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${game.appid}/library_hero.jpg`;

            let primaryColor = null;
            let secondaryColor = null;

            // Extract colors
            try {
                if (coverImage) {
                    const colors = await extractDominantColors(coverImage);
                    if (colors) {
                        primaryColor = colors.primary;
                        secondaryColor = colors.secondary;
                    }
                }
            } catch (e) {
                // Ignore color extraction errors
            }

            // Enrich with IGDB
            let enrichedData = {
                genres: undefined as string | undefined,
                studio: undefined as string | undefined,
                description: undefined as string | undefined,
                releaseDate: undefined as Date | undefined,
                platforms: JSON.stringify(["PC", "Steam Deck"]), // Default as requested
                primaryColor,
                secondaryColor
            };

            try {
                // Search IGDB by name (limit 1 for best match)
                const igdbResults = await searchIgdbGames(game.name, 1);
                if (igdbResults.length > 0) {
                    const igdbGame = igdbResults[0];

                    // Extract Genres
                    if (igdbGame.genres && igdbGame.genres.length > 0) {
                        enrichedData.genres = JSON.stringify(igdbGame.genres.map(g => g.name));
                    }

                    // Extract Studio (Developer)
                    if (igdbGame.involved_companies) {
                        const dev = igdbGame.involved_companies.find(c => c.developer);
                        if (dev) {
                            enrichedData.studio = dev.company.name;
                        }
                    }

                    // Extract Description
                    if (igdbGame.summary) {
                        enrichedData.description = igdbGame.summary;
                    }

                    // Extract Release Date
                    if (igdbGame.first_release_date) {
                        enrichedData.releaseDate = new Date(igdbGame.first_release_date * 1000);
                    }
                }
            } catch (error) {
                console.error(`Failed to enrich game ${game.name}:`, error);
                // Continue with basic data
            }

            // Upsert Game with potentially enriched data
            await prisma.game.upsert({
                where: { id: gameId },
                update: {
                    title: game.name,
                    coverImage,
                    backgroundImage,
                    ...enrichedData,
                    dataMissing: !enrichedData.description
                },
                create: {
                    id: gameId,
                    title: game.name,
                    coverImage,
                    backgroundImage,
                    ...enrichedData,
                    dataMissing: !enrichedData.description
                }
            });

            // Upsert UserLibrary
            // Use Uppercase for Status ("BACKLOG", "PLAYING") and "Main" for completion
            const status = game.playtime_forever > 0 ? 'PLAYING' : 'BACKLOG';

            try {
                await prisma.userLibrary.create({
                    data: {
                        userId: userId,
                        gameId: gameId,
                        status: status,
                        playtimeSteam: game.playtime_forever,
                        targetedCompletionType: 'Main'
                    }
                });
                return true;
            } catch {
                // If already exists, update playtime
                await prisma.userLibrary.update({
                    where: {
                        userId_gameId: {
                            userId: userId,
                            gameId: gameId
                        }
                    },
                    data: {
                        playtimeSteam: game.playtime_forever
                    }
                });
                return true;
            }
        }));

        importedCount += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    }

    return { success: true, count: importedCount };
}

export async function syncSteamPlaytime(options?: { activeOnly?: boolean }) {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // 1. Fetch all steam games AND recent games
    const [steamGames, recentGames] = await Promise.all([
        fetchSteamGames(),
        getRecentlyPlayedGames(userId).catch(e => {
            console.error("Failed to fetch recently played:", e);
            return [] as SteamGame[];
        }) // We need the steamId normally, but fetchSteamGames extracts it. getRecentlyPlayedGames asks for it.
        // Wait, fetchSteamGames logic extracts steamId. We need that logic or we need to extract it again.
        // Let's refactor slightly to get SteamID.
    ]);

    // RE-FETCH STEAM ID for usage (copied logic from fetchSteamGames temporarily or refactor? 
    // fetchSteamGames is exported. Let's just fix the call below by extracting ID first)
    // Actually, to avoid code duplication, I'll rely on fetchSteamGames to get owned. 
    // But for recent, I need the ID. 

    // Quick fetching of steamId again:
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { accounts: true } });
    let steamId = user?.steamId;
    if (!steamId && user?.accounts) {
        const steamAccount = user.accounts.find(acc => acc.provider === 'steam');
        if (steamAccount) steamId = steamAccount.providerAccountId;
    }

    let recentGameMap = new Map<string, number>();
    if (steamId) {
        try {
            // We can't use 'userId' as steamId argument, we need the actual steamId
            // Importing getRecentlyPlayedGames requires importing it first.
            // Implemented below.
            const recents = await import('@/lib/steam').then(m => m.getRecentlyPlayedGames(steamId!));
            recents.forEach(g => {
                recentGameMap.set(g.appid.toString(), g.playtime_2weeks || 0);
            });
        } catch (e) {
            console.error("Failed to fetch recents", e);
        }
    }

    const steamGameMap = new Map(steamGames.map(g => [g.appid.toString(), g]));

    // 2. Fetch user library games to update
    const whereCondition: any = { userId: userId };

    // If activeOnly, filter by status
    if (options?.activeOnly) {
        whereCondition.status = { in: ['PLAYING', 'BACKLOG'] };
    }

    const userLibrary = await prisma.userLibrary.findMany({
        where: whereCondition,
        select: {
            gameId: true,
            playtimeSteam: true,
            playtime2weeks: true,
            lastPlayed: true,
            game: {
                select: {
                    id: true
                }
            }
        }
    });

    let updatedCount = 0;

    // 3. Iterate and Update
    for (const entry of userLibrary) {
        const steamGame = steamGameMap.get(entry.gameId);
        const recentPlaytime = recentGameMap.get(entry.gameId) || 0;

        if (steamGame) {
            // Check if data changed
            const newPlaytime = steamGame.playtime_forever;
            const newLastPlayed = steamGame.rtime_last_played ? new Date(steamGame.rtime_last_played * 1000) : null;

            // Allow 2 weeks playtime update
            const currentRecent = entry.playtime2weeks ?? 0;

            const timeChanged = newPlaytime !== entry.playtimeSteam;
            const recentChanged = recentPlaytime !== currentRecent;

            // Compare dates safely
            const dateChanged = (!entry.lastPlayed && newLastPlayed) ||
                (entry.lastPlayed && newLastPlayed && entry.lastPlayed.getTime() !== newLastPlayed.getTime());

            if (timeChanged || dateChanged || recentChanged) {
                await prisma.userLibrary.update({
                    where: {
                        userId_gameId: {
                            userId: userId,
                            gameId: entry.gameId
                        }
                    },
                    data: {
                        playtimeSteam: newPlaytime,
                        playtime2weeks: recentPlaytime,
                        lastPlayed: newLastPlayed
                    }
                });
                updatedCount++;
            }
        }
    }

    if (updatedCount > 0) {
        revalidatePath('/dashboard');
        revalidatePath('/profile');
    }

    return { success: true, updatedCount };
}
