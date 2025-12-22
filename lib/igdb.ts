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
export async function getDiscoveryGamesIgdb(
    type: 'UPCOMING' | 'POPULAR' | 'RECENT' | 'TOP_RATED' | 'HYPED',
    limit: number = 10
): Promise<EnrichedIgdbGame[]> {
    const now = Math.floor(Date.now() / 1000);
    let whereClause = '';
    let sortClause = '';

    // Standard fields for discovery
    const fields = `fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating,
                    involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                    screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name;`;

    switch (type) {
        case 'UPCOMING':
            // Released in future, sort by soonest
            const twoMonthsFromNow = now + (60 * 24 * 60 * 60);
            whereClause = `where first_release_date > ${now} & first_release_date < ${twoMonthsFromNow} & cover != null;`;
            sortClause = `sort first_release_date asc;`;
            break;

        case 'RECENT':
            // Released in last 30 days
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
            whereClause = `where first_release_date < ${now} & first_release_date > ${thirtyDaysAgo} & cover != null;`;
            sortClause = `sort first_release_date desc;`;
            break;

        case 'TOP_RATED':
            // Released current year, high rating
            const currentYearStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
            whereClause = `where first_release_date >= ${currentYearStart} & first_release_date <= ${now} & total_rating_count > 10 & cover != null;`;
            sortClause = `sort total_rating desc;`;
            break;

        case 'HYPED':
             // Future releases with high hype/interest
             whereClause = `where first_release_date > ${now} & hypes > 0 & cover != null;`;
             sortClause = `sort hypes desc;`;
             break;

        case 'POPULAR':
        default:
             // Fallback to recent popular (last 3 months, high rating)
             const threeMonthsAgo = now - (90 * 24 * 60 * 60);
             whereClause = `where first_release_date > ${threeMonthsAgo} & first_release_date < ${now} & total_rating_count > 20 & cover != null;`;
             sortClause = `sort total_rating_count desc;`;
             break;
    }

    const body = `${fields} ${whereClause} ${sortClause} limit ${limit};`;

    // For HYPED games, we might want to query hypes field specifically if needed, but 'hypes' is not in standard fields list above?
    // Actually 'hypes' is a valid field on Game endpoint but let's check if we requested it.
    // We didn't. But we are sorting by it. It works for sorting even if not in response, usually.
    // However, to be safe and clean, let's stick to the requested fields.

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
