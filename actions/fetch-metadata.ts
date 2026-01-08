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

        const studio = game.involved_companies?.find(c => c.developer || c.publisher)?.company.name || "";
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
