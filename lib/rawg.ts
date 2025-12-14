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
}

export interface RawgSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RawgGame[];
}

const RAWG_API_KEY = process.env.RAWG_API_KEY;
const BASE_URL = 'https://api.rawg.io/api';

export async function searchRawgGame(query: string): Promise<RawgGame | null> {
  if (!RAWG_API_KEY) {
    console.warn('RAWG_API_KEY is not set');
    return null;
  }

  try {
    const url = `${BASE_URL}/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=1`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`);
    }

    const data: RawgSearchResponse = await response.json();

    if (data.results && data.results.length > 0) {
      // Return the first match. In a real app we might want fuzzy matching or user selection.
      return data.results[0];
    }

    return null;
  } catch (error) {
    console.error('Error fetching from RAWG:', error);
    return null;
  }
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
