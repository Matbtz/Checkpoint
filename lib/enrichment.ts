
import { searchIgdbGames, getIgdbImageUrl, IgdbGame, EnrichedIgdbGame } from './igdb';
import { searchRawgGames, getRawgGameDetails, RawgGame } from './rawg';
import { searchSteamStore, SteamStoreGame } from './steam-store';

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

// UTILS
function getSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  // Levenshtein Logic
  const costs = new Array();
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (shorter.charAt(i - 1) !== longer.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }
  return (longerLength - costs[longer.length]) / longerLength;
}

function containsForbiddenTerms(query: string, candidate: string): boolean {
  const forbidden = ['soundtrack', 'artbook', 'dlc', 'season pass', 'bundle'];
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  // Return true if candidate has a forbidden term that the query DOES NOT have
  return forbidden.some(term => c.includes(term) && !q.includes(term));
}

// MAIN MATCHING FUNCTION
export function checkTitleMatch(query: string, candidate: string): number {
    const q = normalizeTitle(query);
    const c = normalizeTitle(candidate);

    if (containsForbiddenTerms(q, c)) return 0; // Immediate reject
    if (q === c) return 100; // Exact match

    const similarity = getSimilarity(q, c);
    return similarity * 100; // Return score 0-100
}

export async function searchGamesEnriched(query: string, provider: 'igdb' | 'rawg' | 'all' = 'all'): Promise<EnrichedGameData[]> {
    let igdbResults: IgdbGame[] = [];
    let rawgResults: RawgGame[] = [];

    if (provider === 'all' || provider === 'igdb') {
        const results = await searchIgdbGames(query, 10); // Increase limit to filter effectively
        igdbResults = results.filter(g => {
            // Filter by category: Main Game (0), Remake (8), Remaster (9), Expanded Game (10)
            const isMainGame = [0, 8, 9, 10].includes(g.category ?? 0);
            if (!isMainGame) return false;

            const score = checkTitleMatch(query, g.name);
            return score >= 60; // Less strict for general search, but filter clear mismatches
        });
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

/**
 * Normalizes a title for loose comparison.
 * Removes special characters, extra spaces, and converts to lowercase.
 */
function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric chars
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
}

/**
 * Checks if release year matches with a tolerance of +/- 1 year.
 */
function isYearMatch(targetYear: number, candidateYear?: number | null): boolean {
    if (!candidateYear) return false;
    return Math.abs(targetYear - candidateYear) <= 1;
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
    const normTitle = normalizeTitle(title);

    // 1. Steam Store (Priority for Library Assets)
    try {
        const steamResults = await searchSteamStore(title);
        const steamMatch = steamResults.find(g => {
            const matchScore = checkTitleMatch(title, g.name);
            const titleMatch = matchScore >= 80;
            const yearMatch = releaseYear ? isYearMatch(releaseYear, g.releaseYear) : true;
            return titleMatch && yearMatch;
        });

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
        const igdbResults = await searchIgdbGames(title, 10); // Fetch more to filter down

        // Filter by category and calculate score
        const candidates = igdbResults.map(g => ({
             ...g,
             matchScore: checkTitleMatch(title, g.name)
        })).filter(g => {
             // Filter by Category (if source is IGDB): [0, 8, 9, 10].includes(game.category)
             const isMainGame = [0, 8, 9, 10].includes(g.category ?? 0);
             if (!isMainGame) return false;

             // Threshold: Only accept matches with a similarity score ≥ 80% (or 90% if no release year is available).
             const threshold = releaseYear ? 80 : 90;
             if (g.matchScore < threshold) return false;

             // Check year match if available
             const gameYear = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null;
             const yearMatch = releaseYear ? isYearMatch(releaseYear, gameYear) : true;

             return yearMatch;
        });

        // Sort by match score descending
        candidates.sort((a, b) => b.matchScore - a.matchScore);

        const igdbMatch = candidates.length > 0 ? candidates[0] : null;

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
            const matchScore = checkTitleMatch(title, g.name);
            const titleMatch = matchScore >= 80;
            const gameYear = g.released ? new Date(g.released).getFullYear() : null;
            const yearMatch = releaseYear ? isYearMatch(releaseYear, gameYear) : true;
            return titleMatch && yearMatch;
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
