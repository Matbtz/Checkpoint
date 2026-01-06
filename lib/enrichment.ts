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
export async function findBestGameArt(title: string, releaseYear?: number | null, excludedSources: string[] = []): Promise<BestArtResult | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const query = normalize(title);

    // Helper for fuzzy matching
    // Using strict rules for Steam matching to avoid DLC/Bundles
    const isSteamMatch = (candidateTitle: string, candidateYear?: number | null) => {
        const nCandidate = normalize(candidateTitle);

        // 1. Block forbidden keywords if query doesn't have them
        const forbidden = ['soundtrack', 'dlc', 'pack', 'bundle', 'bonus', 'season pass'];
        const hasForbidden = forbidden.some(word => nCandidate.includes(word) && !query.includes(word));
        if (hasForbidden) return false;

        // 2. Strict Year Match (Required if both present)
        if (releaseYear && candidateYear) {
            if (Math.abs(releaseYear - candidateYear) > 1) return false;
        }

        // 3. Exact Match Priority
        if (nCandidate === query) return true;

        // 4. Strict Similarity
        const sim = stringSimilarity(nCandidate, query);
        // Require high similarity OR query is contained in title (but check length diff)
        // If "Grand Theft Auto V" is query, "Grand Theft Auto V - Starter Pack" contains it but length diff is huge.

        // If substring match, ensure length difference isn't massive (e.g. > 50% longer)
        if (nCandidate.includes(query) || query.includes(nCandidate)) {
            const lengthDiff = Math.abs(nCandidate.length - query.length);
            if (lengthDiff > query.length * 0.5) return false; // Too much junk added
            return true;
        }

        return sim >= 0.9; // Very strict Levenshtein
    };

    // Generic match for other providers (less strict as they usually return games not DLCs first)
    const isMatch = (candidateTitle: string, candidateYear?: number | null) => {
        const sim = stringSimilarity(normalize(candidateTitle), query);
        const titleMatch = sim >= 0.8 || normalize(candidateTitle).includes(query) || query.includes(normalize(candidateTitle));
        const yearMatch = releaseYear && candidateYear ? Math.abs(releaseYear - candidateYear) <= 1 : true;
        return titleMatch && yearMatch;
    };

    // 1. Steam Store (Priority for Library Assets)
    if (!excludedSources.includes('steam')) {
        try {
            const steamResults = await searchSteamStore(title);

            // Filter and Sort Steam Results
            // Sort by:
            // 1. Exact match
            // 2. Shortest length (closer to query usually means main game)
            const matches = steamResults.filter(g => isSteamMatch(g.name, g.releaseYear));

            matches.sort((a, b) => {
                const nA = normalize(a.name);
                const nB = normalize(b.name);
                const exactA = nA === query;
                const exactB = nB === query;

                if (exactA && !exactB) return -1;
                if (!exactA && exactB) return 1;

                return nA.length - nB.length; // Prefer shorter titles
            });

            if (matches.length > 0) {
                // Iterate through candidates to find one with a valid image
                for (const steamMatch of matches) {
                    const coverUrl = steamMatch.library_cover;

                    // Verify image exists (Steam Store search constructs URL blindly)
                    // Use a short timeout to avoid hanging
                    try {
                        const check = await fetch(coverUrl, { method: 'HEAD', signal: AbortSignal.timeout(1500) });
                        if (check.ok) {
                            return {
                                cover: steamMatch.library_cover,
                                background: steamMatch.library_hero,
                                source: 'steam',
                                originalData: steamMatch
                            };
                        } else {
                            console.log(`[Enrichment] Steam image 404 for ${steamMatch.name} (ID: ${steamMatch.id}): ${coverUrl}`);
                        }
                    } catch (err) {
                        console.log(`[Enrichment] Steam image verification failed for ${steamMatch.name}:`, err);
                    }
                }
                console.log(`[Enrichment] No valid Steam images found for "${title}" among ${matches.length} candidates.`);
            }
        } catch (e) {
            console.error("Error finding art on Steam:", e);
        }
    }

    // 2. IGDB (High quality covers & art -> Priority over RAWG)
    if (!excludedSources.includes('igdb')) {
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
                    cover = getIgdbImageUrl(igdbMatch.cover.image_id, '1080p');
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
    }

    // 3. RAWG (Fallback)
    if (!excludedSources.includes('rawg')) {
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
    }

    return null;
}

export interface FallbackMetadata {
    description?: string;
    screenshots?: string[];
}

/**
 * Attempts to find missing metadata (description, screens) from Steam
 */
export async function findFallbackMetadata(title: string, releaseYear?: number | null): Promise<FallbackMetadata | null> {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const query = normalize(title);

    try {
        const steamResults = await searchSteamStore(title);

        // Matching Logic (Simplified from findBestGameArt)
        const matches = steamResults.filter(g => {
            const nCandidate = normalize(g.name);

            // Year check if valid
            if (releaseYear && g.releaseYear) {
                if (Math.abs(releaseYear - g.releaseYear) > 1) return false;
            }

            // Exact match
            if (nCandidate === query) return true;

            // Fuzzy match
            const sim = stringSimilarity(nCandidate, query);
            if (sim >= 0.85) return true;

            // Substring with length check
            if (nCandidate.includes(query) || query.includes(nCandidate)) {
                const lengthDiff = Math.abs(nCandidate.length - query.length);
                // Allow a bit more flex for fallback than for art, as description is better than nothing
                return lengthDiff <= query.length * 0.6;
            }

            // Prefix Match (for DLCs/Season Passes sharing base name)
            // Ensure significant overlap (e.g. "Sonic Racing: CrossWorlds" -> "sonicracingcrossworlds" is > 20 chars)
            // Using 10 chars as safe minimum for unique titles (avoiding just "Legacy of...")
            const prefixLen = 10;
            if (nCandidate.length >= prefixLen && query.length >= prefixLen) {
                const pC = nCandidate.substring(0, prefixLen);
                const pQ = query.substring(0, prefixLen);
                if (pC === pQ) {
                    // Start matches. Check if year is compatible (already checked above).
                    // This is a strong signal for related content.
                    console.log(`[Fallback] Prefix match found: ${g.name}`);
                    return true;
                }
            }

            return false;
        });

        // Sort by quality of match
        matches.sort((a, b) => {
            const nA = normalize(a.name);
            const nB = normalize(b.name);
            const exactA = nA === query;
            const exactB = nB === query;
            if (exactA && !exactB) return -1;
            if (!exactA && exactB) return 1;
            return nA.length - nB.length;
        });

        if (matches.length > 0) {
            const bestMatch = matches[0];
            // Import the details function dynamically to avoid circular deps if any (though steam-store is leaf)
            // But we already imported searchSteamStore from there, so it's fine.
            const { getSteamGameDetails } = await import('./steam-store');

            const details = await getSteamGameDetails(bestMatch.id);
            if (details) {
                return {
                    description: details.description,
                    screenshots: details.screenshots
                };
            }
        }

    } catch (e) {
        console.error("[Enrichment] Error in findFallbackMetadata:", e);
    }

    return null;
}
