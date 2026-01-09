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
    hypes?: number;
    category?: number; // 0=Main, 1=DLC, 2=Expansion...
    game_type?: number; // User suggested this might replace category
    parent_game?: { id: number; name: string };
    status?: number;
    storyline?: string;
    dlcs?: { id: number; name: string }[];
    expansions?: { id: number; name: string }[];
    expanded_games?: { id: number; name: string }[];
    themes?: { id: number; name: string }[];
    collection?: { id: number; name: string; games?: { id: number; name: string; slug?: string }[] };
    franchises?: { id: number; name: string; games?: { id: number; name: string; slug?: string }[] }[];
    remakes?: { id: number; name: string }[];
    remasters?: { id: number; name: string }[];
    ports?: { id: number; name: string }[];
    keywords?: { id: number; name: string }[];
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

// Helper pour construire l'URL d'une image IGDB
export function getIgdbImageUrl(imageId: string, size: 'cover_big' | 'screenshot_huge' | '1080p' | '720p' = '1080p'): string {
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

        // DEBUG LOG
        // console.log(`[IGDB DEBUG] POST ${endpoint} body: ${query.replace(/\n/g, ' ')}`);

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

function mapRawToEnriched(games: IgdbGame[]): EnrichedIgdbGame[] {
    return games.map(game => {
        const covers: string[] = [];
        const backgrounds: string[] = [];

        if (game.cover?.image_id) {
            // Prefer 1080p for high quality covers (will be ~720x1080 for portraits)
            covers.push(getIgdbImageUrl(game.cover.image_id, '1080p'));
            backgrounds.push(getIgdbImageUrl(game.cover.image_id, '1080p'));
        }

        if (game.artworks) {
            game.artworks.forEach(art => {
                covers.push(getIgdbImageUrl(art.image_id, '1080p'));
                backgrounds.push(getIgdbImageUrl(art.image_id, '1080p'));
            });
        }

        if (game.screenshots) {
            game.screenshots.forEach(screen => {
                backgrounds.push(getIgdbImageUrl(screen.image_id, '1080p'));
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
    const searchClause = query ? `search "${query}";` : '';

    // Exclude fan-made games and mods by default
    // Category 0 = Main Game, 1 = DLC, 2 = Expansion, 3 = Bundle, 4 = Standalone Expansion, 8 = Remake, 9 = Remaster, 10 = Expanded Game
    // We want to exclude Mods (category ?) or just stick to known "Official" types.
    // IGDB Categories:
    // 0: Main Game
    // 1: DLC Addon
    // 2: Expansion
    // 3: Bundle
    // 4: Standalone Expansion
    // 5: Mod
    // 6: Episode
    // 7: Season
    // 8: Remake
    // 9: Remaster
    // 10: Expanded Game
    // 11: Port
    // 12: Fork
    // 13: Pack
    // 14: Update

    // We filter to include only Main, DLC, Expansions, Remakes, Remasters, Expanded.
    // Explicitly Excluding: Mod (5), Episode (6), Season (7), Port (11), Fork (12), Pack (13), Update (14)
    // Actually, safer to just Exclude Category 5 (Mod) explicitly if we want to be broad,
    // or Include specific list. "Official" usually implies removing Mods and maybe Forks.
    // Let's stick to positive inclusion for safety: 0, 1, 2, 3, 4, 8, 9, 10.
    const allowedCategories = [0, 1, 2, 3, 4, 8, 9, 10];
    const categoryFilter = `category = (${allowedCategories.join(',')})`;
    let whereClause = `where ${categoryFilter}`;

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
            whereClause += ` & ${conditions.join(' & ')}`;
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
        ${searchClause}
        ${whereClause};
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, total_rating_count,
               involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
               screenshots.image_id, artworks.image_id, videos.video_id, videos.name, 
               genres.name, platforms.name, themes.name, collection.name, franchises.name, game_type, category,
               keywords.name, ports.name, remakes.name, remasters.name, dlcs.name, expansions.name;
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
            whereClause = `where first_release_date > ${now}`;
            sortClause = 'sort first_release_date asc';
            break;

        case 'RECENT':
            whereClause = `where first_release_date < ${now} & first_release_date > ${oneMonthAgo}`;
            sortClause = 'sort first_release_date desc';
            break;

        case 'POPULAR':
            whereClause = `where total_rating_count > 50 & total_rating > 70`;
            sortClause = 'sort total_rating_count desc';
            break;

        case 'ANTICIPATED':
            whereClause = `where first_release_date > ${now} & hypes > 0`;
            sortClause = 'sort hypes desc';
            break;
    }

    const body = `
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, hypes,
        involved_companies.company.name, genres.name, platforms.name, screenshots.image_id,
        videos.video_id, videos.name, storyline, game_type, category, status,
        keywords.name, themes.name,
        dlcs.name, dlcs.id, expansions.name, expansions.id, expanded_games.name, expanded_games.id,
        remakes.name, remakes.id, remasters.name, remasters.id, ports.name, ports.id,
        collection.name, collection.games.name, collection.games.id, collection.games.slug,
        franchises.name, franchises.games.name, franchises.games.id, franchises.games.slug;
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
        screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name,
        category, game_type, status, storyline,
        parent_game.name, parent_game.id,
        dlcs.name, dlcs.id,
        expansions.name, expansions.id,
        expanded_games.name, expanded_games.id,
        remakes.name, remakes.id,
        remasters.name, remasters.id,
        ports.name, ports.id,
        keywords.name, keywords.id,
        themes.name, themes.id,
        collection.name, collection.id, collection.games.name, collection.games.id, collection.games.slug,
        franchises.name, franchises.id, franchises.games.name, franchises.games.id, franchises.games.slug,
        release_dates.platform.name, release_dates.date, release_dates.region;
        where id = ${gameId};
    `;

    const results = await fetchIgdb<IgdbGame>('games', body);

    if (results.length === 0) return null;
    const game = results[0];
    // console.log(`[IGDB DEBUG] ID ${ gameId } Raw: `, JSON.stringify(game));

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
        screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name, hypes; `;

    // Query: Released in future, has hype, has cover
    const body = `${fields} where first_release_date > ${now} & hypes > 0 & cover != null; sort hypes desc; limit ${limit}; `;

    const games = await fetchIgdb<IgdbGame>('games', body);
    return mapRawToEnriched(games);
}
