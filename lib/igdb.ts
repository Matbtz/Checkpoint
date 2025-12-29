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
 * @param forceRefresh Si true, ignore le token statique et le cache pour forcer une régénération.
 */
export async function getValidToken(forceRefresh = false): Promise<string | null> {
    // 0. Priorité au token statique s'il est fourni (cas sans Secret), sauf si on force le refresh
    if (IGDB_ACCESS_TOKEN && !forceRefresh) {
        return IGDB_ACCESS_TOKEN;
    }

    // 1. Vérification du cache (sauf si forceRefresh)
    if (!forceRefresh && cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    // 2. Génération d'un nouveau token
    if (IGDB_CLIENT_ID && IGDB_SECRET) {
        try {
            const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_SECRET}&grant_type=client_credentials`, {
                method: 'POST'
            });

            if (!response.ok) {
                console.error("[IGDB] Failed to refresh token:", await response.text());
                // Fallback: si le refresh échoue mais qu'on a un token statique, on le renvoie
                if (IGDB_ACCESS_TOKEN) return IGDB_ACCESS_TOKEN;
                return null;
            }

            const data = await response.json();
            cachedToken = data.access_token;
            // Marge de sécurité : on considère qu'il expire 1 minute avant la vraie date
            tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
            return cachedToken;
        } catch (e) {
            console.error("[IGDB] Error refreshing token:", e);
            if (IGDB_ACCESS_TOKEN) return IGDB_ACCESS_TOKEN;
            return null;
        }
    }

    // Si on n'a pas de secret mais qu'on a un token statique (qui a échoué car on est ici avec forceRefresh), on ne peut rien faire de plus.
    if (IGDB_ACCESS_TOKEN) {
        return IGDB_ACCESS_TOKEN;
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

export interface SearchFilters {
    genres?: string[];
    platforms?: string[];
    minScore?: number;
    sortBy?: 'rating' | 'release' | 'popularity' | 'alphabetical' | 'release_asc';
    releaseYear?: number;
    releaseDateModifier?: 'last_30_days' | 'last_2_months' | 'next_2_months' | 'this_year' | 'next_year' | 'past_year' | 'this_month' | 'last_month' | 'next_month';
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
export async function fetchIgdb<T>(endpoint: string, query: string, retrying = false): Promise<T[]> {
    const token = await getValidToken(retrying);

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
 * Recherche de jeux avec récupération étendue des images et filtres
 */
export async function searchIgdbGames(query: string, limit: number = 10, filters?: SearchFilters): Promise<EnrichedIgdbGame[]> {
    let whereClause = query ? `search "${query}"` : '';

    // Add Filters
    if (filters) {
        const conditions: string[] = [];

        if (filters.genres && filters.genres.length > 0) {
            const genresStr = filters.genres.map(g => `"${g}"`).join(',');
            conditions.push(`genres.name = (${genresStr})`);
        }

        if (filters.platforms && filters.platforms.length > 0) {
            const platformsStr = filters.platforms.map(p => `"${p}"`).join(',');
            conditions.push(`platforms.name = (${platformsStr})`);
        }

        if (filters.minScore !== undefined) {
             conditions.push(`aggregated_rating >= ${filters.minScore}`);
        }

        if (filters.releaseYear !== undefined) {
            const startOfYear = Math.floor(new Date(filters.releaseYear, 0, 1).getTime() / 1000);
            const endOfYear = Math.floor(new Date(filters.releaseYear, 11, 31, 23, 59, 59).getTime() / 1000);
            conditions.push(`first_release_date >= ${startOfYear} & first_release_date <= ${endOfYear}`);
        }

        if (filters.releaseDateModifier) {
            const now = new Date();
            let start: number | null = null;
            let end: number | null = null;

            switch (filters.releaseDateModifier) {
                case 'last_30_days': {
                    end = Math.floor(now.getTime() / 1000);
                    const d = new Date(); d.setDate(d.getDate() - 30);
                    start = Math.floor(d.getTime() / 1000);
                    break;
                }
                case 'last_2_months': {
                    end = Math.floor(now.getTime() / 1000);
                    const d = new Date(); d.setMonth(d.getMonth() - 2);
                    start = Math.floor(d.getTime() / 1000);
                    break;
                }
                case 'next_2_months': {
                    start = Math.floor(now.getTime() / 1000);
                    const d = new Date(); d.setMonth(d.getMonth() + 2);
                    end = Math.floor(d.getTime() / 1000);
                    break;
                }
                case 'this_year': {
                    const startD = new Date(now.getFullYear(), 0, 1);
                    const endD = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                    start = Math.floor(startD.getTime() / 1000);
                    end = Math.floor(endD.getTime() / 1000);
                    break;
                }
                case 'next_year': {
                    const startD = new Date(now.getFullYear() + 1, 0, 1);
                    const endD = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59);
                    start = Math.floor(startD.getTime() / 1000);
                    end = Math.floor(endD.getTime() / 1000);
                    break;
                }
                case 'past_year': {
                    end = Math.floor(now.getTime() / 1000);
                    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
                    start = Math.floor(d.getTime() / 1000);
                    break;
                }
                case 'this_month': {
                    const startD = new Date(now.getFullYear(), now.getMonth(), 1);
                    const endD = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    start = Math.floor(startD.getTime() / 1000);
                    end = Math.floor(endD.getTime() / 1000);
                    break;
                }
                case 'last_month': {
                    const startD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const endD = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                    start = Math.floor(startD.getTime() / 1000);
                    end = Math.floor(endD.getTime() / 1000);
                    break;
                }
                case 'next_month': {
                    const startD = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    const endD = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
                    start = Math.floor(startD.getTime() / 1000);
                    end = Math.floor(endD.getTime() / 1000);
                    break;
                }
            }

            if (start && end) {
                conditions.push(`first_release_date >= ${start} & first_release_date <= ${end}`);
            }
        }

        if (conditions.length > 0) {
            // If we have a query (search "foo"), we append with &
            // If no query, we start with 'where' if it's the first condition, or just join them
            if (whereClause) {
                whereClause += ` & ${conditions.join(' & ')}`;
            } else {
                whereClause = `where ${conditions.join(' & ')}`;
            }
        }
    }

    // Sort Logic (Only applies if NO text query is present, as IGDB forbids explicit sort with 'search')
    let sortClause = '';
    if (!query && filters?.sortBy) {
        switch (filters.sortBy) {
            case 'rating':
                sortClause = 'sort aggregated_rating desc;';
                break;
            case 'release':
                sortClause = 'sort first_release_date desc;';
                break;
            case 'release_asc':
                sortClause = 'sort first_release_date asc;';
                break;
            case 'popularity':
                sortClause = 'sort total_rating_count desc;';
                break;
            case 'alphabetical':
                sortClause = 'sort name asc;';
                break;
        }
    } else if (!query) {
         // Default sort if no query and no explicit sort
         sortClause = 'sort aggregated_rating desc;';
    }

    const body = `
        ${whereClause ? whereClause + ';' : ''}
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, total_rating_count,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name;
        ${sortClause}
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
            whereClause = `where first_release_date > ${now} & category = (0, 8, 9)`;
            sortClause = 'sort first_release_date asc';
            break;

        case 'RECENT':
            whereClause = `where first_release_date < ${now} & first_release_date > ${oneMonthAgo} & category = (0, 8, 9)`;
            sortClause = 'sort first_release_date desc';
            break;

        case 'POPULAR':
            whereClause = `where total_rating_count > 50 & total_rating > 70 & category = (0, 8, 9)`;
            sortClause = 'sort total_rating_count desc';
            break;

        case 'ANTICIPATED':
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
    const results = await fetchIgdb<IgdbTimeToBeat>('game_time_to_beats', body);
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
