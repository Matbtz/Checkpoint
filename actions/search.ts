'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { EnrichedGameData } from '@/lib/enrichment';
import { auth } from '@/auth';

export type SearchResult = EnrichedGameData & {
    isAdded: boolean;
    libraryStatus: string | null;
};

/**
 * Helper to sanitize search queries
 * Replaces punctuation (like :) with spaces to allow flexible matching
 */
function sanitizeQuery(query: string): string {
    // Keep alphanumerics, spaces, and accents. Replace everything else with space.
    return query.replace(/[^\w\s\u00C0-\u00FF]/g, ' ').trim();
}

export async function searchLocalGames(query: string): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Prepare Query Terms
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) return [];

    // Split into individual terms (e.g. "Zelda:" -> ["Zelda"])
    const terms = sanitizedQuery.split(/\s+/).filter(t => t.length > 0);

    // 2. Build Search Clause
    // We use OR to be permissive: match exact string OR sanitized string OR any individual word
    const whereClause = {
        OR: [
            { title: { contains: query, mode: 'insensitive' as const } },           // Match "The Legend of Zelda:"
            { title: { contains: sanitizedQuery, mode: 'insensitive' as const } },  // Match "The Legend of Zelda "
            ...terms.map(term => ({
                title: { contains: term, mode: 'insensitive' as const }             // Match "Zelda"
            }))
        ]
    };

    // 3. Fetch Games
    const games = await prisma.game.findMany({
        where: whereClause,
        take: 10,
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 4. Fetch Library Status (if logged in)
    const libraryMap = new Map<string, string>();
    if (userId && games.length > 0) {
        const gameIds = games.map(g => g.id);
        const userLibraryEntries = await prisma.userLibrary.findMany({
            where: {
                userId: userId,
                gameId: { in: gameIds }
            },
            select: {
                gameId: true,
                status: true
            }
        });

        for (const entry of userLibraryEntries) {
            libraryMap.set(entry.gameId, entry.status);
        }
    }

    // 5. Map to SearchResult
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
        source: 'igdb', // Local games originated from IGDB usually
        originalData: {} as any,
        isAdded: libraryMap.has(game.id),
        libraryStatus: libraryMap.get(game.id) || null
    }));
}

export async function searchOnlineGames(query: string): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Fetch from IGDB
    const igdbResults = await searchIgdbGames(query, 10);

    if (igdbResults.length === 0) return [];

    // 2. Check for existence in local DB (to link to existing IDs/data)
    const igdbIds = igdbResults.map(g => String(g.id));
    const titles = igdbResults.map(g => g.name);

    // We try to find matching local games to reuse their IDs or data
    const existingGames = await prisma.game.findMany({
        where: {
            OR: [
                { igdbId: { in: igdbIds } },
                { id: { in: igdbIds } },
                { title: { in: titles, mode: 'insensitive' } }
            ]
        }
    });

    // Create lookup map
    const existingMap = new Map<string, typeof existingGames[0]>();
    existingGames.forEach(g => {
        if (g.igdbId) existingMap.set(g.igdbId, g);
        existingMap.set(g.id, g);
        existingMap.set(g.title.toLowerCase(), g);
    });

    // 3. Fetch Library Status for the matches we found
    const libraryMap = new Map<string, string>();
    if (userId && existingGames.length > 0) {
        const localGameIds = existingGames.map(g => g.id);
        const userLibraryEntries = await prisma.userLibrary.findMany({
            where: {
                userId: userId,
                gameId: { in: localGameIds }
            },
            select: {
                gameId: true,
                status: true
            }
        });

        for (const entry of userLibraryEntries) {
            libraryMap.set(entry.gameId, entry.status);
        }
    }

    // 4. Map results
    return igdbResults.map(game => {
        const idStr = String(game.id);
        // Try to find if this IGDB game already exists in our DB
        const localMatch = existingMap.get(idStr) || existingMap.get(game.name.toLowerCase());

        if (localMatch) {
            // Return local object if found
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
                isAdded: libraryMap.has(localMatch.id),
                libraryStatus: libraryMap.get(localMatch.id) || null
            };
        } else {
            // Return new IGDB object
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
                isAdded: false,
                libraryStatus: null
            };
        }
    });
}
