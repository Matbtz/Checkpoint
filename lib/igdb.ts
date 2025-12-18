const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_SECRET = process.env.IGDB_SECRET;

const BASE_URL = 'https://api.igdb.com/v4';

// Cache simple pour le token en mémoire
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Récupère un token valide via Client ID + Secret.
 * Le token est mis en cache et régénéré automatiquement avant expiration.
 */
async function getValidToken(): Promise<string | null> {
    // 1. Vérification du cache
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    // 2. Génération d'un nouveau token
    if (IGDB_CLIENT_ID && IGDB_SECRET) {
        try {
            // console.log("[IGDB] Refreshing access token..."); // Décommenter pour debug
            const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`, {
                method: 'POST'
            });

            if (!response.ok) {
                console.error("[IGDB] Failed to refresh token:", await response.text());
                return null;
            }

            const data = await response.json();
            cachedToken = data.access_token;
            // Marge de sécurité : on considère qu'il expire 1 minute avant la vraie date
            tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
            return cachedToken;
        } catch (e) {
            console.error("[IGDB] Error refreshing token:", e);
            return null;
        }
    }

    console.error("[IGDB] Credentials missing. Please check IGDB_CLIENT_ID and IGDB_SECRET in .env");
    return null;
}

// --- Interfaces ---

export interface IgdbImageObject {
    id: number;
    image_id: string;
}

export interface IgdbCompany {
    id: number;
    developer: boolean;
    publisher: boolean;
    company: {
        id: number;
        name: string;
    };
}

export interface IgdbGame {
    id: number;
    name: string;
    cover?: IgdbImageObject;
    first_release_date?: number;
    summary?: string;
    aggregated_rating?: number; // Critic Score
    involved_companies?: IgdbCompany[];
    screenshots?: IgdbImageObject[];
    artworks?: IgdbImageObject[];
    genres?: { id: number; name: string }[];
}

export interface EnrichedIgdbGame extends IgdbGame {
    possibleCovers: string[];
    possibleBackgrounds: string[];
}

/**
 * Helper pour construire l'URL d'une image IGDB
 */
export function getIgdbImageUrl(imageId: string, size: 'cover_big' | 'screenshot_huge' | '1080p' = 'cover_big'): string {
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

/**
 * Fetch générique avec gestion du retry 401 (Unauthorized)
 */
async function fetchIgdb<T>(endpoint: string, query: string, retrying = false): Promise<T[]> {
    const token = await getValidToken();

    if (!IGDB_CLIENT_ID || !token) {
        return [];
    }

    try {
        const response = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': IGDB_CLIENT_ID,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            body: query,
        });

        if (!response.ok) {
            // Si le token est invalide (401), on le vide et on réessaie une fois
            if (response.status === 401 && !retrying) {
                console.warn("[IGDB] Token expired (401). Retrying with fresh token...");
                cachedToken = null;
                tokenExpiry = null;
                return fetchIgdb<T>(endpoint, query, true);
            }

            console.error(`[IGDB] API Error ${response.status}: ${response.statusText}`);
            return [];
        }

        return await response.json();
    } catch (error) {
        console.error('[IGDB] Network error:', error);
        return [];
    }
}

/**
 * Recherche de jeux avec récupération étendue des images
 */
export async function searchIgdbGames(query: string, limit: number = 10): Promise<EnrichedIgdbGame[]> {
    const body = `
        search "${query}";
        fields name, cover.image_id, first_release_date, summary, aggregated_rating,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, genres.name, platforms.name;
        limit ${limit};
    `;

    const games = await fetchIgdb<IgdbGame>('games', body);

    // Mapping et déduplication des images
    return games.map(game => {
        const covers: string[] = [];
        const backgrounds: string[] = [];

        if (game.cover?.image_id) {
            covers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));
            backgrounds.push(getIgdbImageUrl(game.cover.image_id, 'screenshot_huge'));
        }

        if (game.artworks) {
            game.artworks.forEach(art => {
                covers.push(getIgdbImageUrl(art.image_id, 'cover_big'));
                backgrounds.push(getIgdbImageUrl(art.image_id, 'screenshot_huge'));
            });
        }

        if (game.screenshots) {
            game.screenshots.forEach(screen => {
                backgrounds.push(getIgdbImageUrl(screen.image_id, 'screenshot_huge'));
            });
        }

        return {
            ...game,
            possibleCovers: Array.from(new Set(covers)),
            possibleBackgrounds: Array.from(new Set(backgrounds))
        };
    });
}

/**
 * Récupère les détails d'un jeu spécifique par ID
 */
export async function getIgdbGameDetails(gameId: number): Promise<EnrichedIgdbGame | null> {
    const body = `
        fields name, cover.image_id, first_release_date, summary, aggregated_rating,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, genres.name, platforms.name;
        where id = ${gameId};
    `;

    const results = await fetchIgdb<IgdbGame>('games', body);

    if (results.length === 0) return null;
    const game = results[0];

    const covers: string[] = [];
    const backgrounds: string[] = [];

    if (game.cover?.image_id) {
        covers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));
        backgrounds.push(getIgdbImageUrl(game.cover.image_id, 'screenshot_huge'));
    }
    if (game.artworks) {
        game.artworks.forEach(art => {
            covers.push(getIgdbImageUrl(art.image_id, 'cover_big'));
            backgrounds.push(getIgdbImageUrl(art.image_id, 'screenshot_huge'));
        });
    }
    if (game.screenshots) {
        game.screenshots.forEach(screen => {
            backgrounds.push(getIgdbImageUrl(screen.image_id, 'screenshot_huge'));
        });
    }

    return {
        ...game,
        possibleCovers: Array.from(new Set(covers)),
        possibleBackgrounds: Array.from(new Set(backgrounds))
    };
}
