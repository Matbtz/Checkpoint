
import { searchIgdbGames, getIgdbImageUrl, IgdbGame } from './igdb';
import { searchRawgGames, RawgGame } from './rawg';

export interface EnrichedGameData {
    id: string; // provider ID
    title: string;
    releaseDate: string | null;
    studio: string | null;
    metacritic: number | null;
    possibleCovers: string[];
    possibleBackgrounds: string[];
    source: 'igdb' | 'rawg';
    originalData: IgdbGame | RawgGame;
}

export async function searchGamesEnriched(query: string): Promise<EnrichedGameData[]> {
    const [igdbResults, rawgResults] = await Promise.all([
        searchIgdbGames(query, 5),
        searchRawgGames(query, 5)
    ]);

    const enrichedIgdb = igdbResults.map(game => {
        const developer = game.involved_companies?.find(c => c.developer)?.company.name || null;

        const possibleCovers: string[] = [];
        if (game.cover) {
            possibleCovers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));
        }

        const possibleBackgrounds: string[] = [];
        if (game.screenshots) {
            game.screenshots.forEach(s => possibleBackgrounds.push(getIgdbImageUrl(s.image_id, '1080p')));
        }
        if (game.artworks) {
            game.artworks.forEach(a => possibleBackgrounds.push(getIgdbImageUrl(a.image_id, '1080p')));
        }

        return {
            id: String(game.id),
            title: game.name,
            releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : null,
            studio: developer,
            metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
            possibleCovers,
            possibleBackgrounds,
            source: 'igdb' as const,
            originalData: game
        };
    });

    const enrichedRawg = rawgResults.map(game => {
        const developer = game.developers && game.developers.length > 0 ? game.developers[0].name : null;

        const possibleCovers = game.background_image ? [game.background_image] : [];
        const possibleBackgrounds = game.short_screenshots ? game.short_screenshots.map(s => s.image) : [];
        if (game.background_image && !possibleBackgrounds.includes(game.background_image)) {
             possibleBackgrounds.unshift(game.background_image);
        }

        return {
            id: String(game.id),
            title: game.name,
            releaseDate: game.released,
            studio: developer,
            metacritic: game.metacritic,
            possibleCovers, // RAWG doesn't strictly distinguish cover/bg in search results same way, often background_image is used for both
            possibleBackgrounds,
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
