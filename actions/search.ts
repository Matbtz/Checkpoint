'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl, SearchFilters } from '@/lib/igdb';
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

export async function searchLocalGames(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Prepare Query Terms
    const sanitizedQuery = sanitizeQuery(query);
    if (!sanitizedQuery) return [];

    // Split into individual terms (e.g. "Zelda:" -> ["Zelda"])
    const terms = sanitizedQuery.split(/\s+/).filter(t => t.length > 0);

    // 2. Build Search Clause
    // We use OR to be permissive: match exact string OR sanitized string OR any individual word
    const whereClause: any = {
        OR: [
            { title: { contains: query, mode: 'insensitive' as const } },           // Match "The Legend of Zelda:"
            { title: { contains: sanitizedQuery, mode: 'insensitive' as const } },  // Match "The Legend of Zelda "
            ...terms.map(term => ({
                title: { contains: term, mode: 'insensitive' as const }             // Match "Zelda"
            }))
        ]
    };

    // Add Score Filter
    if (filters?.minScore !== undefined) {
        whereClause.opencriticScore = { gte: filters.minScore };
    }

    // 3. Fetch Games (More than 10 to allow in-memory filtering for JSON fields)
    const games = await prisma.game.findMany({
        where: whereClause,
        take: 50, // Increase limit to allow for filtering
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 4. In-Memory Filtering for JSON fields (Genres, Platforms)
    let filteredGames = games;

    if (filters) {
        if (filters.genres && filters.genres.length > 0) {
            filteredGames = filteredGames.filter(game => {
                 if (!game.genres) return false;
                 try {
                     const g = JSON.parse(game.genres as string);
                     return Array.isArray(g) && g.some((genre: string) => filters.genres?.includes(genre));
                 } catch { return false; }
            });
        }

        if (filters.platforms && filters.platforms.length > 0) {
            filteredGames = filteredGames.filter(game => {
                if (!game.platforms) return false;
                 try {
                     const p = game.platforms;
                     if (Array.isArray(p)) {
                         return p.some((plat: any) => {
                             const name = typeof plat === 'string' ? plat : plat?.name;
                             return filters.platforms?.includes(name);
                         });
                     }
                     return false;
                 } catch { return false; }
            });
        }
    }

    // Limit back to 10
    filteredGames = filteredGames.slice(0, 10);

    // 5. Fetch Library Status (if logged in)
    const libraryMap = new Map<string, string>();
    if (userId && filteredGames.length > 0) {
        const gameIds = filteredGames.map(g => g.id);
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

    // 6. Map to SearchResult
    return filteredGames.map(game => ({
        id: game.id,
        title: game.title,
        releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
        studio: game.studio,
        metacritic: null,
        opencriticScore: game.opencriticScore,
        genres: game.genres ? JSON.parse(game.genres as string) : [],
        availableCovers: game.coverImage ? [game.coverImage] : [],
        availableBackgrounds: game.backgroundImage ? [game.backgroundImage] : [],
        source: 'igdb', // Local games originated from IGDB usually
        originalData: {} as any,
        isAdded: libraryMap.has(game.id),
        libraryStatus: libraryMap.get(game.id) || null
    }));
}

export async function searchOnlineGames(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Fetch from IGDB with filters
    const igdbResults = await searchIgdbGames(query, 10, filters);

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
                metacritic: null,
                opencriticScore: localMatch.opencriticScore,
                genres: localMatch.genres ? JSON.parse(localMatch.genres as string) : [],
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
                metacritic: null,
                // Use IGDB aggregated_rating as proxy for OpenCritic if not local, but ideally we fetch real OpenCritic later.
                // The interface expects opencriticScore. We can populate it if we have it from IGDB (aggregated_rating is critic score).
                opencriticScore: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
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
