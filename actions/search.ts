'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { EnrichedGameData } from '@/lib/enrichment';
import { auth } from '@/auth';

// Define a type that extends EnrichedGameData with library status
export type SearchGameResult = EnrichedGameData & {
    isAdded: boolean;
    libraryStatus: string | null;
};

export async function searchLocalGames(query: string): Promise<SearchGameResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Prepare flexible search terms
    // Split query by spaces to allow matching "Original Sin" against "Divinity: Original Sin"
    const terms = query.trim().split(/\s+/).filter(Boolean);

    // 2. Search in local DB with flexible OR condition
    const games = await prisma.game.findMany({
        where: {
            OR: [
                // Matches exact phrase (e.g. "Super Mario")
                { title: { contains: query, mode: 'insensitive' } },
                // Matches individual words (e.g. "Mario" or "64")
                ...terms.map(term => ({
                    title: { contains: term, mode: 'insensitive' },
                })),
            ],
        },
        take: 10,
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 3. Fetch Library Status for these games if user is logged in
    const libraryMap = new Map<string, string>(); // GameID -> Status
    
    if (userId && games.length > 0) {
        const userLibrary = await prisma.userLibrary.findMany({
            where: {
                userId: userId,
                gameId: { in: games.map(g => g.id) }
            },
            select: {
                gameId: true,
                status: true
            }
        });

        userLibrary.forEach(record => {
            libraryMap.set(record.gameId, record.status);
        });
    }

    // 4. Map to EnrichedGameData with Status
    return games.map(game => ({
        id: game.id,
        title: game.title,
        releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
        studio: game.studio,
        metacritic: game.metacritic,
        opencritic: game.opencritic,
        genres: game.genres ? JSON.parse(game.genres) : [],
        availableCovers: game.coverImage ? [game.coverImage] : [],
        availableBackgrounds: game.backgroundImage ? [game.backgroundImage] : [],
        source: 'igdb', 
        originalData: {} as any,
        // New fields
        isAdded: libraryMap.has(game.id),
        libraryStatus: libraryMap.get(game.id) || null,
    }));
}

export async function searchOnlineGames(query: string): Promise<SearchGameResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Fetch from IGDB
    const igdbResults = await searchIgdbGames(query, 10);

    if (igdbResults.length === 0) return [];

    // 2. Check for existence in local DB (to link to existing IDs/data)
    const igdbIds = igdbResults.map(g => String(g.id));
    const titles = igdbResults.map(g => g.name);

    const existingGames = await prisma.game.findMany({
        where: {
            OR: [
                { igdbId: { in: igdbIds } },
                { id: { in: igdbIds } }, // Also check ID just in case
                { title: { in: titles, mode: 'insensitive' } }
            ]
        }
    });

    // Create a lookup map for faster access to existing games
    const existingMap = new Map<string, typeof existingGames[0]>();
    existingGames.forEach(g => {
        if (g.igdbId) existingMap.set(g.igdbId, g);
        existingMap.set(g.id, g);
        existingMap.set(g.title.toLowerCase(), g);
    });

    // 3. Fetch Library Status for the games we found locally
    const libraryMap = new Map<string, string>();
    
    if (userId && existingGames.length > 0) {
        const userLibrary = await prisma.userLibrary.findMany({
            where: {
                userId: userId,
                gameId: { in: existingGames.map(g => g.id) }
            },
            select: { gameId: true, status: true }
        });
        userLibrary.forEach(record => {
            libraryMap.set(record.gameId, record.status);
        });
    }

    // 4. Map results
    return igdbResults.map(game => {
        const idStr = String(game.id);
        const localMatch = existingMap.get(idStr) || existingMap.get(game.name.toLowerCase());

        if (localMatch) {
            // Return local object if found (preserves local data structure)
            return {
                id: localMatch.id,
                title: localMatch.title,
                releaseDate: localMatch.releaseDate ? localMatch.releaseDate.toISOString() : null,
                studio: localMatch.studio,
                metacritic: localMatch.metacritic,
                opencritic: localMatch.opencritic,
                genres: localMatch.genres ? JSON.parse(localMatch.genres) : [],
                availableCovers: localMatch.coverImage ? [localMatch.coverImage] : [],
                availableBackgrounds: localMatch.backgroundImage ? [localMatch.backgroundImage] : [],
                source: 'igdb',
                originalData: game,
                // Status from local match
                isAdded: libraryMap.has(localMatch.id),
                libraryStatus: libraryMap.get(localMatch.id) || null
            };
        } else {
            // Return IGDB object (fresh result)
            const developer = game.involved_companies?.find(c => c.developer)?.company.name || null;
            const genres = game.genres?.map(g => g.name) || [];

            const availableCovers: string[] = [];
            if (game.cover) {
                availableCovers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));
            }

            const availableBackgrounds: string[] = [];
            if (game.screenshots) {
                game.screenshots.forEach(s => availableBackgrounds.push(getIgdbImageUrl(s.image_id, '1080p')));
            }
            if (game.artworks) {
                game.artworks.forEach(a => availableBackgrounds.push(getIgdbImageUrl(a.image_id, '1080p')));
            }

            return {
                id: idStr,
                title: game.name,
                releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : null,
                studio: developer,
                metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
                genres,
                availableCovers,
                availableBackgrounds,
                source: 'igdb',
                originalData: game,
                // Not in DB -> Not in Library
                isAdded: false,
                libraryStatus: null
            };
        }
    });
}
