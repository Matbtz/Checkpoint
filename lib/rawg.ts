
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
    const url = `${BASE_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`);
    }

    const data: RawgSearchResponse = await response.json();

    if (data.results && data.results.length > 0) {
      return data.results;
    }

    return [];
  } catch (error) {
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
