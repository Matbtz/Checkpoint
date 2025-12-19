
import { searchIgdbGames, getIgdbImageUrl, IgdbGame } from './igdb';
import { searchRawgGames, getRawgGameDetails, RawgGame } from './rawg';

export interface EnrichedGameData {
    id: string; // provider ID
    title: string;
    releaseDate: string | null;
    studio: string | null;
    metacritic: number | null;
    opencritic?: number | null;
    genres: string[];
    platforms?: string[];
    availableCovers: string[];
    availableBackgrounds: string[];
    source: 'igdb' | 'rawg' | 'manual' | 'local';
    originalData: IgdbGame | RawgGame | null;
    description?: string;
}

export async function searchGamesEnriched(query: string, provider: 'igdb' | 'rawg' | 'all' = 'all'): Promise<EnrichedGameData[]> {
    let igdbResults: IgdbGame[] = [];
    let rawgResults: RawgGame[] = [];

    if (provider === 'all' || provider === 'igdb') {
        igdbResults = await searchIgdbGames(query, 5);
    }
    if (provider === 'all' || provider === 'rawg') {
        const rawgList = await searchRawgGames(query, 5);
        // Enrich RAWG results with details to get developers/studio which are missing in list view
        rawgResults = await Promise.all(rawgList.map(async (game) => {
             const details = await getRawgGameDetails(game.id);
             // Preserve short_screenshots from list view as they are missing in details view
             if (details && game.short_screenshots) {
                 details.short_screenshots = game.short_screenshots;
             }
             return details || game;
        }));
    }

    const enrichedIgdb = igdbResults.map(game => {
        const developer = game.involved_companies?.find(c => c.developer)?.company.name || null;
        const genres = game.genres?.map(g => g.name) || [];
        const platforms = game.platforms?.map(p => p.name) || [];

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
            id: String(game.id),
            title: game.name,
            releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : null,
            studio: developer,
            metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
            genres,
            platforms,
            availableCovers,
            availableBackgrounds,
            source: 'igdb' as const,
            originalData: game
        };
    });

    const enrichedRawg = rawgResults.map(game => {
        const developer = game.developers && game.developers.length > 0 ? game.developers[0].name : null;
        const genres = game.genres?.map(g => g.name) || [];

        const availableBackgrounds = game.short_screenshots ? game.short_screenshots.map(s => s.image) : [];
        if (game.background_image && !availableBackgrounds.includes(game.background_image)) {
             availableBackgrounds.unshift(game.background_image);
        }

        // Use background image AND screenshots for covers as well, as RAWG doesn't have dedicated vertical covers in search
        const availableCovers = [game.background_image, ...(game.short_screenshots?.map(s => s.image) || [])].filter(Boolean) as string[];

        return {
            id: String(game.id),
            title: game.name,
            releaseDate: game.released,
            studio: developer,
            metacritic: game.metacritic,
            genres,
            availableCovers,
            availableBackgrounds,
            source: 'rawg' as const,
            originalData: game
        };
    });

    // Merge or present both? For now, we return a combined list, or maybe prioritize IGDB?
    // The prompt says "Modify the search function".
    // I will return a combined list for now, allowing the frontend to filter/display.
    // Given IGDB is usually cleaner for metadata, we put it first.

    return [...enrichedIgdb, ...enrichedRawg];
}
