import { searchIgdbGames, getIgdbImageUrl, IgdbGame, EnrichedIgdbGame } from './igdb';
import { searchRawgGames, getRawgGameDetails, RawgGame } from './rawg';
import { searchSteamStore, SteamStoreGame } from './steam-store';
import { stringSimilarity } from './utils';

export interface EnrichedGameData {
    id: string; // provider ID
    title: string;
    releaseDate: string | null;
    studio: string | null;
    metacritic: number | null;
    opencriticScore?: number | null;
    opencriticUrl?: string | null;
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

    return [...enrichedIgdb, ...enrichedRawg];
}

export interface BestArtResult {
    cover: string | null;
    background: string | null;
    source: 'steam' | 'igdb' | 'rawg';
    originalData?: EnrichedIgdbGame | RawgGame | SteamStoreGame;
}

/**
 * Intelligent Cascade for finding the best game art.
 * Priority: Steam Library > IGDB > RAWG
 */
export async function findBestGameArt(title: string, releaseYear?: number | null): Promise<BestArtResult | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const query = normalize(title);

    // Helper for fuzzy matching
    // Using simple substring strategy + new Levenshtein strictness
    const isMatch = (candidateTitle: string, candidateYear?: number | null) => {
        const sim = stringSimilarity(normalize(candidateTitle), query);
        // High threshold (0.85) for safety, or substring match
        const titleMatch = sim >= 0.85 || normalize(candidateTitle).includes(query) || query.includes(normalize(candidateTitle));
        const yearMatch = releaseYear && candidateYear ? Math.abs(releaseYear - candidateYear) <= 1 : true;
        return titleMatch && yearMatch;
    };

    // 1. Steam Store (Priority for Library Assets)
    try {
        const steamResults = await searchSteamStore(title);
        const steamMatch = steamResults.find(g => isMatch(g.name, g.releaseYear));

        if (steamMatch) {
            return {
                cover: steamMatch.library_cover,
                background: steamMatch.library_hero,
                source: 'steam',
                originalData: steamMatch
            };
        }
    } catch (e) {
        console.error("Error finding art on Steam:", e);
    }

    // 2. IGDB (High quality covers & art)
    try {
        // Fetch a bit more to allow fuzzy match within top results
        const igdbResults = await searchIgdbGames(title, 5);
        const igdbMatch = igdbResults.find(g => {
            const gameYear = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null;
            return isMatch(g.name, gameYear);
        });

        if (igdbMatch) {
            let cover = null;
            if (igdbMatch.cover) {
                cover = getIgdbImageUrl(igdbMatch.cover.image_id, 'cover_big');
            }

            let background = null;
            // Prioritize artworks, then screenshots
            if (igdbMatch.artworks && igdbMatch.artworks.length > 0) {
                background = getIgdbImageUrl(igdbMatch.artworks[0].image_id, '1080p');
            } else if (igdbMatch.screenshots && igdbMatch.screenshots.length > 0) {
                background = getIgdbImageUrl(igdbMatch.screenshots[0].image_id, '1080p');
            }

            return {
                cover,
                background,
                source: 'igdb',
                originalData: igdbMatch
            };
        }
    } catch (e) {
        console.error("Error finding art on IGDB:", e);
    }

    // 3. RAWG (Fallback)
    try {
        const rawgResults = await searchRawgGames(title, 5);
        const rawgMatch = rawgResults.find(g => {
            const gameYear = g.released ? new Date(g.released).getFullYear() : null;
            return isMatch(g.name, gameYear);
        });

        if (rawgMatch) {
            return {
                cover: rawgMatch.background_image || null,
                background: rawgMatch.background_image || null, // RAWG often shares same image
                source: 'rawg',
                originalData: rawgMatch
            };
        }
    } catch (e) {
        console.error("Error finding art on RAWG:", e);
    }

    return null;
}
