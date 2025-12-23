const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_SECRET = process.env.IGDB_SECRET;
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

const BASE_URL = 'https://api.igdb.com/v4';

// Cache simple pour le token en mémoire
let cachedToken: string | null = null;
let tokenExpiry: number | null = null;

/**
 * Récupère un token valide via Client ID + Secret.
 * Le token est mis en cache et régénéré automatiquement avant expiration.
 */
async function getValidToken(): Promise<string | null> {
    // 0. Priorité au token statique s'il est fourni (cas sans Secret)
    if (IGDB_ACCESS_TOKEN) {
        return IGDB_ACCESS_TOKEN;
    }

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

export interface IgdbVideo {
    id: number;
    video_id: string;
    name: string;
}

export interface IgdbGame {
    id: number;
    name: string;
    slug?: string;
    url?: string;
    cover?: IgdbImageObject;
    first_release_date?: number;
    summary?: string;
    aggregated_rating?: number; // Critic Score
    total_rating?: number; // Average of critic and user
    involved_companies?: IgdbCompany[];
    screenshots?: IgdbImageObject[];
    artworks?: IgdbImageObject[];
    videos?: IgdbVideo[];
    genres?: { id: number; name: string }[];
    platforms?: { id: number; name: string }[];
}

export interface EnrichedIgdbGame extends IgdbGame {
    possibleCovers: string[];
    possibleBackgrounds: string[];
}

export type DiscoveryType = 'UPCOMING' | 'POPULAR' | 'ANTICIPATED' | 'RECENT';

export interface IgdbTimeToBeat {
    id: number;
    game_id: number;
    hastly: number; // Seconds
    normally: number; // Seconds
    completely: number; // Seconds
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
 * Helper to map raw IGDB games to EnrichedIgdbGame
 */
function mapRawToEnriched(games: IgdbGame[]): EnrichedIgdbGame[] {
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
 * Recherche de jeux avec récupération étendue des images
 */
export async function searchIgdbGames(query: string, limit: number = 10): Promise<EnrichedIgdbGame[]> {
    const body = `
        search "${query}";
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name;
        limit ${limit};
    `;

    const games = await fetchIgdb<IgdbGame>('games', body);
    return mapRawToEnriched(games);
}

/**
 * Discovery Queries for Homepage
 */
export async function getDiscoveryGamesIgdb(type: DiscoveryType, limit: number = 10): Promise<EnrichedIgdbGame[]> {
    const now = Math.floor(Date.now() / 1000);
    const oneMonthAgo = now - (30 * 24 * 60 * 60);

    let whereClause = '';
    let sortClause = '';

    switch (type) {
        case 'UPCOMING':
            // Jeux qui sortent dans le futur
            // category = (0, 8, 9) filtre pour avoir jeux principaux, remakes et remasters (exclut DLCs)
            whereClause = `where first_release_date > ${now} & category = (0, 8, 9)`;
            sortClause = 'sort first_release_date asc';
            break;

        case 'RECENT':
            // Sortis dans les 30 derniers jours
            whereClause = `where first_release_date < ${now} & first_release_date > ${oneMonthAgo} & category = (0)`;
            sortClause = 'sort first_release_date desc';
            break;

        case 'POPULAR':
            // Basé sur le nombre de votes (activité) et une note décente
            whereClause = `where total_rating_count > 50 & total_rating > 70 & category = (0, 8, 9)`;
            sortClause = 'sort total_rating_count desc';
            break;

        case 'ANTICIPATED':
            // Basé sur la "hype" (feature spécifique IGDB) pour les jeux futurs
            whereClause = `where first_release_date > ${now} & hypes > 0 & category = (0, 8, 9)`;
            sortClause = 'sort hypes desc';
            break;
    }

    const body = `
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, hypes,
               involved_companies.company.name, genres.name, platforms.name, screenshots.image_id;
        ${whereClause};
        ${sortClause};
        limit ${limit};
    `;

    const games = await fetchIgdb<IgdbGame>('games', body);
    return mapRawToEnriched(games);
}

/**
 * Récupère les détails d'un jeu spécifique par ID
 */
export async function getIgdbGameDetails(gameId: number): Promise<EnrichedIgdbGame | null> {
    const body = `
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name;
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

/**
 * Récupère les données Time To Beat pour un jeu
 */
export async function getIgdbTimeToBeat(gameId: number): Promise<IgdbTimeToBeat | null> {
    const body = `
        fields *;
        where game_id = ${gameId};
    `;
    const results = await fetchIgdb<IgdbTimeToBeat>('time_to_beat', body);
    return results.length > 0 ? results[0] : null;
}

/**
 * Fetches "Hyped" games (future releases with high interest) from IGDB.
 */
export async function getHypedGames(limit: number = 10): Promise<EnrichedIgdbGame[]> {
    const now = Math.floor(Date.now() / 1000);
    const fields = `fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating,
                    involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                    screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name, hypes;`;

    // Query: Released in future, has hype, has cover
    const body = `${fields} where first_release_date > ${now} & hypes > 0 & cover != null; sort hypes desc; limit ${limit};`;

    const games = await fetchIgdb<IgdbGame>('games', body);
    return mapRawToEnriched(games);
}
