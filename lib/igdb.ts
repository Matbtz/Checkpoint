
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

const BASE_URL = 'https://api.igdb.com/v4';

export interface IgdbGame {
    id: number;
    name: string;
    cover?: { id: number; url: string; image_id: string };
    first_release_date?: number;
    summary?: string;
    aggregated_rating?: number; // Critic Score
    involved_companies?: { company: { name: string }; developer: boolean }[];
    screenshots?: { id: number; url: string; image_id: string }[];
    artworks?: { id: number; url: string; image_id: string }[];
}

export interface IgdbImage {
    url: string;
    type: 'cover' | 'background';
}

async function fetchIgdb(endpoint: string, query: string) {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
        console.warn('IGDB credentials missing');
        return [];
    }

    try {
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': IGDB_CLIENT_ID,
                'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
            },
            body: query,
        });

        if (!response.ok) {
            console.error(`IGDB API error: ${response.status} ${response.statusText}`);
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching from IGDB:', error);
        return [];
    }
}

export async function searchIgdbGames(query: string, limit: number = 10): Promise<IgdbGame[]> {
    // Construct query for games
    // We need: name, cover, release date, summary, aggregated_rating, involved_companies (developer), screenshots, artworks
    const body = `
        search "${query}";
        fields name, cover.image_id, first_release_date, summary, aggregated_rating,
               involved_companies.company.name, involved_companies.developer,
               screenshots.image_id, artworks.image_id;
        limit ${limit};
    `;
    return await fetchIgdb('games', body);
}

export function getIgdbImageUrl(imageId: string, size: 'cover_big' | 'screenshot_huge' | '1080p' = 'cover_big'): string {
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

export async function getIgdbGameDetails(gameId: number): Promise<IgdbGame | null> {
    const body = `
        fields name, cover.image_id, first_release_date, summary, aggregated_rating,
               involved_companies.company.name, involved_companies.developer,
               screenshots.image_id, artworks.image_id;
        where id = ${gameId};
    `;
    const results = await fetchIgdb('games', body);
    return results.length > 0 ? results[0] : null;
}
