'use server';

import { auth } from '@/auth';
import { getOwnedGames, SteamGame } from '@/lib/steam';
import { prisma } from '@/lib/db';
import { searchIgdbGames } from '@/lib/igdb';

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
            const steamCover = `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`;

            // Enrich with IGDB
            let enrichedData = {
                genres: undefined as string | undefined,
                studio: undefined as string | undefined,
                description: undefined as string | undefined,
                releaseDate: undefined as Date | undefined,
                metacritic: undefined as number | undefined,
                platforms: JSON.stringify(["PC", "Steam Deck"]) // Default as requested
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

                    // Extract Metacritic (Aggregated Rating)
                    if (igdbGame.aggregated_rating) {
                        enrichedData.metacritic = Math.round(igdbGame.aggregated_rating);
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
                    coverImage: steamCover,
                    ...enrichedData,
                    dataMissing: !enrichedData.description
                },
                create: {
                    id: gameId,
                    title: game.name,
                    coverImage: steamCover,
                    ...enrichedData,
                    dataMissing: !enrichedData.description
                }
            });

            // Upsert UserLibrary
            // Use Title Case for Status ("Backlog", "Playing") and "Main" for completion
            const status = game.playtime_forever > 0 ? 'Playing' : 'Backlog';

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
