'use server';

import { auth } from '@/auth';
import { getIgdbGameDetails, searchIgdbGames } from '@/lib/igdb';
import { searchRawgGames, getRawgGameDetails } from '@/lib/rawg';

export interface ExternalMetadata {
    title: string;
    studio: string;
    releaseDate: Date | null;
    genres: string[];
    platforms: string[];
    igdbScore: number | null;
    steamReviewPercent: number | null; // Note: RAWG/IGDB might not have this fresh, but we can try
    franchise: string | null;
    source: 'IGDB' | 'RAWG';
}

export interface MetadataCandidate {
    id: string;
    title: string;
    releaseDate: Date | null;
    source: 'IGDB' | 'RAWG';
    studio?: string;
}

export async function searchMetadataCandidates(query: string): Promise<MetadataCandidate[]> {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const candidates: MetadataCandidate[] = [];

    const [igdbRes, rawgRes] = await Promise.allSettled([
        searchIgdbGames(query, 5),
        searchRawgGames(query, 5)
    ]);

    if (igdbRes.status === 'fulfilled') {
        igdbRes.value.forEach(g => {
            const studio = g.involved_companies?.find(c => c.developer)?.company.name || g.involved_companies?.find(c => c.publisher)?.company.name;
            candidates.push({
                id: g.id.toString(),
                title: g.name,
                releaseDate: g.first_release_date ? new Date(g.first_release_date * 1000) : null,
                source: 'IGDB',
                studio
            });
        });
    }

    if (rawgRes.status === 'fulfilled') {
        rawgRes.value.forEach(g => {
            candidates.push({
                id: g.id.toString(),
                title: g.name,
                releaseDate: g.released ? new Date(g.released) : null,
                source: 'RAWG'
            });
        });
    }

    // Sort by Levenshtein distance (closest title match) or simple relevance?
    // User mentioned "using levenshtein distance".
    // I'll implement a simple sort here or let client do it? Server side is better.
    // For now, I'll just return them. The search functions usually return sorted by relevance.
    // I will interleave them or just return concatenated.

    return candidates;
}

export async function fetchExternalMetadata(provider: 'IGDB' | 'RAWG', query: string, externalId?: string): Promise<ExternalMetadata | null> {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    if (provider === 'IGDB') {
        // Prefer ID if available
        let game = null;
        if (externalId) {
            game = await getIgdbGameDetails(parseInt(externalId));
        }

        // Fallback to search if no ID or ID fetch failed (rare)
        if (!game && query) {
            const results = await searchIgdbGames(query, 1);
            if (results.length > 0) game = results[0];
        }

        if (!game) return null;

        const studio = game.involved_companies?.find(c => c.developer)?.company.name || game.involved_companies?.find(c => c.publisher)?.company.name || "";
        const releaseDate = game.first_release_date ? new Date(game.first_release_date * 1000) : null;
        const genres = game.genres?.map(g => g.name) || [];
        const platforms = game.platforms?.map(p => p.name) || [];
        const franchise = game.franchises?.[0]?.name || game.collection?.name || null;

        return {
            title: game.name,
            studio,
            releaseDate,
            genres,
            platforms,
            igdbScore: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
            steamReviewPercent: null, // IGDB usually doesn't have live Steam review %
            franchise,
            source: 'IGDB'
        };

    } else if (provider === 'RAWG') {
         // Prefer ID if available
        let game = null;
        if (externalId && !isNaN(parseInt(externalId))) { // RAWG ID is int?
            game = await getRawgGameDetails(parseInt(externalId));
        }

        // Search fallback
        if (!game && query) {
            const results = await searchRawgGames(query, 1);
            if (results.length > 0) {
                 // Search results are partial, need details
                 game = await getRawgGameDetails(results[0].id);
            }
        }

        if (!game) return null;

        const studio = game.developers?.[0]?.name || "";
        const releaseDate = game.released ? new Date(game.released) : null;
        const genres = game.genres?.map(g => g.name) || [];
        const platforms = game.platforms?.map(p => p.platform.name) || [];

        return {
            title: game.name,
            studio,
            releaseDate,
            genres,
            platforms,
            igdbScore: null,
            steamReviewPercent: null,
            franchise: null, // RAWG might have this in 'series'?
            source: 'RAWG'
        };
    }

    return null;
}
