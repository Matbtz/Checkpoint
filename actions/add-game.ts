'use server';

import { searchRawgGames, getRawgGameDetails } from '@/lib/rawg';
import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { searchSteamStore } from '@/lib/steam-store';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function searchGamesAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    return await searchRawgGames(query);
}

export async function searchGamesMultiProvider(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Fetch from all providers in parallel
    const [rawgResults, igdbResults, steamResults] = await Promise.allSettled([
        searchRawgGames(query, 5),
        searchIgdbGames(query),
        searchSteamStore(query)
    ]);

    // Consolidate Cover Art & Backgrounds from all results into a unified pool of choices
    // Since we don't have a reliable way to link IDGB ID -> RAWG ID -> Steam ID instantly without complex matching,
    // we will return the search results from the PRIMARY provider (RAWG for now as it's the ID basis)
    // BUT we will append a "rich media" object that the frontend can use to populate the image pickers.

    // However, the frontend "AddGameWizard" currently expects a list of games.
    // If the user selects a game, we want to offer them covers from *that* game.
    // But since we are searching, we might get "Elden Ring" from all 3.

    // STRATEGY: Return RAWG games as the base "identities" (since our DB uses RAWG IDs primarily currently).
    // And for each game, try to find matching images from other providers if the names match closely.

    const games = rawgResults.status === 'fulfilled' ? rawgResults.value : [];
    const igdbGames = igdbResults.status === 'fulfilled' ? igdbResults.value : [];
    const steamGames = steamResults.status === 'fulfilled' ? steamResults.value : [];

    // Helper to calculate token overlap (Jaccard Index-ish)
    const calculateOverlap = (s1: string, s2: string) => {
        const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const t1 = new Set(tokenize(s1));
        const t2 = new Set(tokenize(s2));
        const intersection = new Set([...t1].filter(x => t2.has(x)));
        const union = new Set([...t1, ...t2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    };

    const enrichedGames = games.map(game => {
        const extraCovers: string[] = [];
        const extraBackgrounds: string[] = [];

        // 1. Find matching IGDB games (Aggressive matching)
        // Filter to find ALL matches with > 0.3 overlap (loose)
        const igdbMatches = igdbGames.filter(i => calculateOverlap(game.name, i.name) > 0.3);

        igdbMatches.forEach(igdbMatch => {
            if (igdbMatch.cover) extraCovers.push(getIgdbImageUrl(igdbMatch.cover.image_id, 'cover_big'));
            if (igdbMatch.screenshots) {
                 igdbMatch.screenshots.forEach(s => extraBackgrounds.push(getIgdbImageUrl(s.image_id, 'screenshot_huge')));
            }
            if (igdbMatch.artworks) {
                 igdbMatch.artworks.forEach(a => extraBackgrounds.push(getIgdbImageUrl(a.image_id, '1080p')));
            }
        });

        // 2. Find matching Steam games (Aggressive matching)
        const steamMatches = steamGames.filter(s => calculateOverlap(game.name, s.name) > 0.3);

        steamMatches.forEach(steamMatch => {
             extraCovers.push(steamMatch.imageUrl); // Steam capsule is often used as cover
             // Steam header image
             extraBackgrounds.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamMatch.id}/header.jpg`);
             extraBackgrounds.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamMatch.id}/library_hero.jpg`);
        });

        // Deduplicate
        const uniqueCovers = Array.from(new Set(extraCovers));
        const uniqueBackgrounds = Array.from(new Set(extraBackgrounds));

        return {
            ...game,
            extraCovers: uniqueCovers,
            extraBackgrounds: uniqueBackgrounds
        };
    });

    return enrichedGames;
}

export async function addGameById(gameId: number) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // 1. Check if game exists in DB
    let game = await prisma.game.findUnique({
        where: { id: String(gameId) },
    });

    if (!game) {
        // 2. Fetch details from RAWG
        const details = await getRawgGameDetails(gameId);
        if (!details) {
            throw new Error("Game not found on RAWG");
        }

        // 3. Create game in DB
        const developer = details.developers && details.developers.length > 0 ? details.developers[0].name : null;

        game = await prisma.game.create({
            data: {
                id: String(details.id),
                title: details.name,
                coverImage: details.background_image,
                releaseDate: details.released ? new Date(details.released) : null,
                genres: JSON.stringify(details.genres.map((g: { name: string; }) => g.name)),
                developer: developer,
                metacritic: details.metacritic,
                dataMissing: true // Flag for enrichment
            }
        });
    }

    // 4. Add to user library
    const existingEntry = await prisma.userLibrary.findUnique({
        where: {
            userId_gameId: {
                userId: session.user.id,
                gameId: game.id
            }
        }
    });

    if (existingEntry) {
        throw new Error("Game already in library");
    }

    await prisma.userLibrary.create({
        data: {
            userId: session.user.id,
            gameId: game.id,
            status: 'Backlog',
        }
    });

    revalidatePath('/dashboard');
    return game;
}
