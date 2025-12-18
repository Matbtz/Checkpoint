'use server';

import { prisma } from '@/lib/db';
import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { EnrichedGameData } from '@/lib/enrichment';

export async function searchLocalGames(query: string): Promise<EnrichedGameData[]> {
    // 1. Search in local DB
    // We search by title using 'contains' (case-insensitive usually depending on DB collation, but assuming simple here)
    const games = await prisma.game.findMany({
        where: {
            title: {
                contains: query,
                mode: 'insensitive',
            },
        },
        take: 10,
        // Sort by local popularity? We don't have a view count yet, maybe sort by creation?
        // Or just basic match. Prompt says "Trie par pertinence ou popularité locale".
        // Let's use `updatedAt` as a proxy for "active" games or just title for now.
        // If we had library counts, that would be ideal.
        orderBy: {
            updatedAt: 'desc',
        }
    });

    // 2. Map to EnrichedGameData
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
        source: 'igdb', // Defaulting to IGDB as source since most IDs come from there, or we could add 'local' to type
        originalData: {} as any // We don't have the raw original data here, empty object or minimal
    }));
}

export async function searchOnlineGames(query: string): Promise<EnrichedGameData[]> {
    // 1. Fetch from IGDB
    const igdbResults = await searchIgdbGames(query, 10);

    if (igdbResults.length === 0) return [];

    // 2. Check for existence in local DB
    // We check by IGDB ID (stringified) OR Title
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

    // Create a lookup map for faster access
    const existingMap = new Map<string, typeof existingGames[0]>();
    existingGames.forEach(g => {
        if (g.igdbId) existingMap.set(g.igdbId, g);
        existingMap.set(g.id, g);
        existingMap.set(g.title.toLowerCase(), g);
    });

    // 3. Map results
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
                originalData: game // Keep original data if needed for augmentation later
            };
        } else {
            // Return IGDB object (without OpenCritic for now)
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
                // opencritic: undefined, // Explicitly undefined/missing
                genres,
                availableCovers,
                availableBackgrounds,
                source: 'igdb',
                originalData: game
            };
        }
    });
}
