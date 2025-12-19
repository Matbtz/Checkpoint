'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { EnrichedGameData } from '@/lib/enrichment';
import { auth } from '@/auth';

export type SearchResult = EnrichedGameData & {
    isAdded: boolean;
    libraryStatus: string | null;
};

export async function searchLocalGames(query: string): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Search in local DB
    // Flexible Search: match full query OR any individual term
    // Sanitize query: replace punctuation with space to handle "Zelda:" vs "Zelda"
    const sanitizedQuery = query.replace(/[^\w\s\u00C0-\u00FF]/g, ' ').trim();

    if (!sanitizedQuery) return [];

    const terms = sanitizedQuery.split(/\s+/).filter(t => t.length > 0);

    const whereClause = {
        OR: [
            { title: { contains: query, mode: 'insensitive' as const } }, // Try exact original query first
            { title: { contains: sanitizedQuery, mode: 'insensitive' as const } }, // Try sanitized full query
            ...terms.map(term => ({ title: { contains: term, mode: 'insensitive' as const } }))
        ]
    };

    const games = await prisma.game.findMany({
        where: whereClause,
        take: 10,
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 2. Fetch Library Status if logged in
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

    // 3. Map to SearchResult
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

    // 2. Check for existence in local DB
    const igdbIds = igdbResults.map(g => String(g.id));
    const titles = igdbResults.map(g => g.name);

    const existingGames = await prisma.game.findMany({
        where: {
            OR: [
                { igdbId: { in: igdbIds } },
                { id: { in: igdbIds } },
                { title: { in: titles, mode: 'insensitive' } }
            ]
        }
    });

    const existingMap = new Map<string, typeof existingGames[0]>();
    existingGames.forEach(g => {
        if (g.igdbId) existingMap.set(g.igdbId, g);
        existingMap.set(g.id, g);
        existingMap.set(g.title.toLowerCase(), g);
    });

    // 3. Fetch Library Status for existing games
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
                originalData: game, // Keep original data if needed for augmentation later
                isAdded: libraryMap.has(localMatch.id),
                libraryStatus: libraryMap.get(localMatch.id) || null
            };
        } else {
            // Return IGDB object
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
