
export interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released: string;
  background_image: string;
  rating: number;
  metacritic: number;
  genres: { id: number; name: string; slug: string }[];
  description_raw?: string;
  platforms?: { platform: { id: number; name: string; slug: string } }[];
  developers?: { id: number; name: string; slug: string }[];
  short_screenshots?: { id: number; image: string }[];
  reviews_count?: number;
}

export interface RawgSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RawgGame[];
}

const RAWG_API_KEY = process.env.RAWG_API_KEY;
const BASE_URL = 'https://api.rawg.io/api';

export async function searchRawgGames(query: string, limit: number = 10): Promise<RawgGame[]> {
  if (!RAWG_API_KEY) {
    console.warn('RAWG_API_KEY is not set');
    return [];
  }

  try {
    // Add filters to exclude additions/series to reduce noise, though RAWG search is still broad
    const url = `${BASE_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=${limit * 2}&exclude_additions=true&exclude_game_series=true`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('RAWG API Rate Limit 429');
      }
      if (response.status === 401) {
        throw new Error('RAWG API Unauthorized 401');
      }
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`);
    }

    const data: RawgSearchResponse = await response.json();

    if (data.results && data.results.length > 0) {
      // Post-fetch filtering to remove low-quality "fan" games
      // Strategy:
      // 1. Must have a release date (fan games often don't, or it's just a year) - but RAWG dates vary.
      // 2. Filter out items with 0 rating AND 0 ratings_count if they are not very new.
      // 3. Filter out items with "Mod" in the name if it's not the query.

      const filtered = data.results.filter(g => {
        // Exclude if no release date (often garbage)
        if (!g.released) return false;

        const releaseDate = new Date(g.released);
        const now = new Date();
        // Check if recently released (last 6 months)
        const isRecent = (now.getTime() - releaseDate.getTime()) < (180 * 24 * 60 * 60 * 1000);

        // Filter out games with very low engagement unless they are brand new
        // 1. If rating is 0 AND (reviews_count is 0 or undefined) -> likely junk/fan game
        const hasReviews = (g.reviews_count || 0) > 0;
        const hasRating = g.rating > 0;

        if (!hasRating && !hasReviews && !isRecent) {
          return false;
        }

        // 2. Extra check: if reviews_count is < 2 and it's an old game (> 1 year), likely obscure
        const isOld = (now.getTime() - releaseDate.getTime()) > (365 * 24 * 60 * 60 * 1000);
        if (isOld && (g.reviews_count || 0) < 2) {
          return false;
        }

        return true;
      });

      return filtered.slice(0, limit);
    }

    return [];
  } catch (error: any) {
    if (error.message && (error.message.includes('429') || error.message.includes('401'))) {
      throw error;
    }
    console.error('Error fetching from RAWG:', error);
    return [];
  }
}

// Keep the old function for backward compatibility if needed, or refactor it to use searchRawgGames
export async function searchRawgGame(query: string): Promise<RawgGame | null> {
  const results = await searchRawgGames(query, 1);
  return results.length > 0 ? results[0] : null;
}

export async function getRawgGameDetails(id: number): Promise<RawgGame | null> {
  if (!RAWG_API_KEY) {
    return null;
  }

  try {
    const url = `${BASE_URL}/games/${id}?key=${RAWG_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error(e);
    return null;
  }
}
