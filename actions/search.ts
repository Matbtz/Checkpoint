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

    // 3. Fetch Games (Fetch more to allow in-memory filtering for platforms & fuzzy sort)
    // Increased from 50 to 100 to ensure we get enough results after platform filtering
    const games = await prisma.game.findMany({
        where: whereClause,
        take: 100,
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 4. In-Memory Filtering and Levenshtein Sorting
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

    // Levenshtein Scoring & Filtering (> 90)
    // We map to an intermediate object to hold the score
    let scoredGames = filteredGames.map(game => {
        const score = stringSimilarity(game.title, query) * 100;
        return { ...game, matchScore: score };
    });

    // Filter by score > 90 (Task 2)
    // Note: If the user search is partial "Zeld", score might be low for "The Legend of Zelda".
    // "stringSimilarity" is based on Levenshtein. "Zeld" vs "The Legend of Zelda" has high distance.
    // However, the SQL "contains" already ensures the words are there.
    // If the user requirement is strict "propose scores above 90", we filter.
    // But this might hide valid partial matches.
    // Given the request "introduce a lewenstein distance score to propose scores above 90",
    // it implies we should prioritize or maybe ONLY show high matches.
    // I'll filter for now, but keep in mind this might be too strict for partial queries.
    // Actually, usually "propose" means "rank higher". But "in the results" with a threshold often implies filtering.
    // Let's filter > 90 OR if the query is very short, maybe relax?
    // Let's stick to the request: "propose scores above 90".

    // Wait, if I type "Baldur", "Baldur's Gate 3" score is ~50%.
    // If I enforce > 90, I won't see it until I type almost the full name.
    // That seems like bad UX. Maybe the user means "Show score and highlight > 90"?
    // OR maybe "Sort by score"?
    // "propose scores above 90 in the results" -> ambiguous.
    // Interpretation: "Use score to rank, and maybe visually indicate high matches?"
    // OR "Only return > 90".
    // Let's implement Sorting by score first. And maybe filter if score is very low?
    // But since we use AND sql query, we already have good matches.
    // I will Sort by score. And if score > 90, maybe it's "proposed"?
    // I'll filter only if score is decent (e.g. > 40) but rank > 90 first.
    // User said "propose scores above 90". I will Filter > 90 to be safe with the "propose" wording,
    // assuming the user wants high precision.
    // BUT, for partial searches, this kills discovery.
    // Let's assume the user means "Sort/Rank" effectively.
    // I'll sort by score descending.

    scoredGames.sort((a, b) => b.matchScore - a.matchScore);

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

    // Sort by Score
    scoredResults.sort((a, b) => b.matchScore - a.matchScore);

    // Filter > 90 ?? If I do this, online search becomes useless for discovery.
    // I'll just keep the sort. The user said "propose scores above 90".
    // Maybe they meant "Only show those > 90"? I'll interpret as "Prioritize".

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
                libraryStatus: null,
                matchScore: game.matchScore
            };
        }
    });
}
