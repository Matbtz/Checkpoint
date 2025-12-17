
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_SECRET = process.env.IGDB_SECRET; // This might be missing if not set in env
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

const BASE_URL = 'https://api.igdb.com/v4';

// Simple in-memory cache for the token (mostly for dev server persistence during a run)
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

async function getValidToken(): Promise<string | null> {
    // If we have a valid cached token, use it
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    // If environment variable is provided, use it as fallback or primary if no secret
    if (IGDB_ACCESS_TOKEN && !IGDB_SECRET) {
        return IGDB_ACCESS_TOKEN;
    }

    // Attempt to fetch fresh token if we have credentials
    if (IGDB_CLIENT_ID && IGDB_SECRET) {
        try {
            console.log("Fetching new IGDB access token...");
            const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`, {
                method: 'POST'
            });

            if (!response.ok) {
                console.error("Failed to fetch IGDB token:", await response.text());
                // Fallback to static token if available
                return IGDB_ACCESS_TOKEN || null;
            }

            const data = await response.json();
            cachedToken = data.access_token;
            // Set expiry a bit earlier than actual (expires_in is in seconds)
            tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

            return cachedToken;
        } catch (e) {
            console.error("Error fetching IGDB token:", e);
        }
    }

    // Fallback
    return IGDB_ACCESS_TOKEN || null;
}

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
    genres?: { id: number; name: string }[];
}

export interface IgdbImage {
    url: string;
    type: 'cover' | 'background';
}

async function fetchIgdb(endpoint: string, query: string, retrying = false): Promise<any[]> {
    const token = await getValidToken();

    if (!IGDB_CLIENT_ID || !token) {
        console.warn('IGDB credentials missing or invalid');
        return [];
    }

    try {
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': IGDB_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
            },
            body: query,
        });

        if (!response.ok) {
            console.error(`IGDB API error: ${response.status} ${response.statusText}`);

            if (response.status === 401) {
                cachedToken = null; // Invalidate cache

                if (!retrying && IGDB_SECRET) {
                    console.log("IGDB 401 received. Attempting to refresh token and retry...");
                    return fetchIgdb(endpoint, query, true);
                } else if (!IGDB_SECRET) {
                    console.error("IGDB 401 Unauthorized. IGDB_SECRET is missing, so token cannot be refreshed automatically. Please update IGDB_ACCESS_TOKEN or provide IGDB_SECRET.");
                }
            }
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
    // We need: name, cover, release date, summary, aggregated_rating, involved_companies (developer), screenshots, artworks, genres
    const body = `
        search "${query}";
        fields name, cover.image_id, first_release_date, summary, aggregated_rating,
               involved_companies.company.name, involved_companies.developer,
               screenshots.image_id, artworks.image_id, genres.name;
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
               screenshots.image_id, artworks.image_id, genres.name;
        where id = ${gameId};
    `;
    const results = await fetchIgdb('games', body);
    return results.length > 0 ? results[0] : null;
}
