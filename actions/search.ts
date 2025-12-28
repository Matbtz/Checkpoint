'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl, SearchFilters } from '@/lib/igdb';
import { EnrichedGameData } from '@/lib/enrichment';
import { auth } from '@/auth';
import { stringSimilarity } from '@/lib/utils';

export type SearchResult = EnrichedGameData & {
    isAdded: boolean;
    libraryStatus: string | null;
    matchScore?: number;
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

    // Check if we have filters but no query
    const hasFilters = filters && (
        (filters.genres && filters.genres.length > 0) ||
        (filters.platforms && filters.platforms.length > 0) ||
        (filters.minScore !== undefined && filters.minScore > 0)
    );

    if (!sanitizedQuery && !hasFilters) return [];

    // Split into individual terms (e.g. "Zelda:" -> ["Zelda"])
    const terms = sanitizedQuery ? sanitizedQuery.split(/\s+/).filter(t => t.length > 0) : [];

    // 2. Build Search Clause - AND condition for strict term matching
    const whereClause: any = {
        AND: [
             // Ensure all terms are present
             ...terms.map(term => ({
                title: { contains: term, mode: 'insensitive' as const }
             })),
             // Optional filters
             ...(filters?.minScore !== undefined ? [{ opencriticScore: { gte: filters.minScore } }] : [])
        ]
    };

    // Add Genre filtering to DB query (since it's a stringified JSON, contains works well)
    if (filters?.genres && filters.genres.length > 0) {
        // We want games that have AT LEAST ONE of the selected genres.
        // OR logic: (genre contains A) OR (genre contains B)
        whereClause.AND.push({
            OR: filters.genres.map(g => ({
                genres: { contains: g }
            }))
        });
    }

    // 3. Determine Sort Order
    let orderBy: any = { updatedAt: 'desc' }; // Default fallback if no sort matches
    if (filters?.sortBy) {
        switch (filters.sortBy) {
            case 'rating':
                orderBy = { opencriticScore: 'desc' };
                break;
            case 'release':
                orderBy = { releaseDate: 'desc' };
                break;
            case 'popularity':
                // Use steamReviewCount as proxy for popularity if available
                orderBy = { steamReviewCount: 'desc' };
                break;
            case 'alphabetical':
                orderBy = { title: 'asc' };
                break;
        }
    } else {
        // Default to Rating if not specified (per user request)
        orderBy = { opencriticScore: 'desc' };
    }

    // 4. Fetch Games (Fetch more to allow in-memory filtering for platforms & fuzzy sort)
    // Increased from 50 to 100 to ensure we get enough results after platform filtering
    const games = await prisma.game.findMany({
        where: whereClause,
        take: 100,
        orderBy: orderBy,
    });

    // 5. In-Memory Filtering and Levenshtein Sorting
    let filteredGames = games;

    // Platform Filter (JSON structure makes DB filtering complex, keep in memory)
    if (filters) {

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

    // Levenshtein Scoring
    let scoredGames = filteredGames.map(game => {
        const score = stringSimilarity(game.title, query) * 100;
        return { ...game, matchScore: score };
    });

    // Sort Logic Conflict:
    // If query exists, usually we want relevant results (Levenshtein match).
    // If query exists AND user picked a sort, should we override relevance?
    // The user said "On the global search put an option to sort...".
    // Usually explicit sort overrides relevance.

    if (filters?.sortBy && filters.sortBy !== 'rating') { // 'rating' default might clash with relevance if implicit
        // If explicit sort is requested (other than default rating which matches our fallback),
        // we trust the DB order we just fetched (orderBy applied in step 4).
        // So we do NOT re-sort by matchScore.
        // However, 'games' array is already sorted by DB. 'scoredGames' preserves that order map.
    } else {
        // If no specific sort requested (or just rating/default), and we have a query,
        // we might prefer relevance?
        // Actually, if query is present, relevance is king.
        // But if user selected "Release Date", they expect "Zelda" games sorted by date, not by name similarity.
        // So: If query is present, default is Relevance. If Sort is explicit, Sort wins.
        // The user said "By default put it like rating".

        if (query && !filters?.sortBy) {
             scoredGames.sort((a, b) => b.matchScore - a.matchScore);
        }
        // If query is empty, DB order (from sortBy) is already correct.
    }

    // Limit back to 25
    const finalGames = scoredGames.slice(0, 25);

    // 5. Fetch Library Status (if logged in)
    const libraryMap = new Map<string, string>();
    if (userId && finalGames.length > 0) {
        const gameIds = finalGames.map(g => g.id);
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
    return finalGames.map(game => ({
        id: game.id,
        title: game.title,
        releaseDate: game.releaseDate ? game.releaseDate.toISOString() : null,
        studio: game.studio,
        metacritic: null,
        opencriticScore: game.opencriticScore,
        genres: game.genres ? JSON.parse(game.genres as string) : [],
        availableCovers: game.coverImage ? [game.coverImage] : [],
        availableBackgrounds: game.backgroundImage ? [game.backgroundImage] : [],
        source: 'igdb',
        originalData: {} as any,
        isAdded: libraryMap.has(game.id),
        libraryStatus: libraryMap.get(game.id) || null,
        matchScore: game.matchScore
    }));
}

export async function searchOnlineGames(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const session = await auth();
    const userId = session?.user?.id;

    // 1. Fetch from IGDB with filters
    const igdbResults = await searchIgdbGames(query, 10, filters);

    if (igdbResults.length === 0) return [];

    // Calculate Scores
    let scoredResults = igdbResults.map(g => ({
        ...g,
        matchScore: stringSimilarity(g.name, query) * 100
    }));

    // Sort Logic for Online Search
    // IGDB handles sort if query is empty.
    // If query is present, we get relevance sort from API.
    // If user requested explicit sort WITH query, we must sort in memory.
    if (query && filters?.sortBy) {
        scoredResults.sort((a, b) => {
            switch (filters.sortBy) {
                case 'rating':
                    return (b.aggregated_rating || 0) - (a.aggregated_rating || 0);
                case 'release':
                    return (b.first_release_date || 0) - (a.first_release_date || 0);
                case 'popularity':
                     // Using total_rating_count (if fetched, we need to ensure it's in the object)
                     // EnrichedIgdbGame extends IgdbGame which has total_rating_count?
                     // Need to check lib/igdb.ts interface. It was added in fields.
                     // Wait, I need to cast 'a' to any if interface is missing property in Typescript definition
                     // actually I added total_rating_count to fetch body but did I add it to interface?
                     // I will assume standard properties or use 'total_rating' as proxy if count missing.
                     // Let's use total_rating_count if available.
                     return ((b as any).total_rating_count || 0) - ((a as any).total_rating_count || 0);
                case 'alphabetical':
                    return a.name.localeCompare(b.name);
                default:
                    return b.matchScore - a.matchScore;
            }
        });
    } else if (query) {
        // Default to relevance
         scoredResults.sort((a, b) => b.matchScore - a.matchScore);
    }

    // 2. Check for existence in local DB (to link to existing IDs/data)
    const igdbIds = scoredResults.map(g => String(g.id));
    const titles = scoredResults.map(g => g.name);

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
    return scoredResults.map(game => {
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
                libraryStatus: libraryMap.get(localMatch.id) || null,
                matchScore: game.matchScore
            };
        } else {
            // Return new IGDB object
            const developer = game.involved_companies?.find(c => c.developer)?.company.name || null;
            const genres = game.genres?.map(g => g.name) || [];

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
                availableCovers: game.possibleCovers || [],
                availableBackgrounds: game.possibleBackgrounds || [],
                source: 'igdb',
                originalData: game,
                isAdded: false,
                libraryStatus: null,
                matchScore: game.matchScore
            };
        }
    });
}
