
import fs from 'fs';
import path from 'path';
import { loadEnvConfig } from '@next/env';
import type { IgdbGame, IgdbTimeToBeat } from '../lib/igdb';

// --- Configuration ---
const BATCH_SIZE = 500;
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'csv');

// --- Helper Functions ---

function escapeCsv(field: any): string {
    if (field === null || field === undefined) return '';
    let str = String(field);

    // Remove carriage returns and newlines (replace with space)
    str = str.replace(/[\r\n]+/g, ' ');

    // Replace " with ""
    str = str.replace(/"/g, '""');
    // If field contains delimiter or quote, wrap in quotes
    if (str.includes('|') || str.includes('"')) {
        return `"${str}"`;
    }
    return str;
}

// Format Date to ISO string
function formatDate(timestamp?: number): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toISOString();
}

// --- Main Script ---

async function main() {
    // Load environment variables before importing lib/igdb
    loadEnvConfig(process.cwd());
    const { fetchIgdb, getIgdbImageUrl } = await import('../lib/igdb');
    const { findBestGameArt } = await import('../lib/enrichment');


    const yearArg = process.argv[2];
    if (!yearArg) {
        console.error("Please provide a year as an argument. Example: npx tsx scripts/fetch-year-games.ts 2023");
        process.exit(1);
    }

    const year = parseInt(yearArg, 10);
    if (isNaN(year) || year < 1950 || year > 2100) {
        console.error("Invalid year provided.");
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const startDate = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
    const endDate = Math.floor(new Date(`${year + 1}-01-01T00:00:00Z`).getTime() / 1000);

    console.log(`Fetching games for year ${year} (Timestamp: ${startDate} to ${endDate})...`);


    const headers = [
        "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
        "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
        "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
        "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
        "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
        "storyline", "status", "gameType", "parentId", "relatedGames"
    ];

    const csvPath = path.join(OUTPUT_DIR, `games_${year}.csv`);
    const writeStream = fs.createWriteStream(csvPath);

    // Write Header
    writeStream.write(headers.map(h => escapeCsv(h)).join('|') + '\n');

    let offset = 0;
    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching batch starting at offset ${offset}...`);

        // Fetch filtered games (popularity/rating filter)
        // Filter: Ratings >= 5 OR Hypes >= 2
        // This removes ~95% of junk/shovelware while keeping obscure but rated games and hyped upcoming titles.

        // UPGRADE: Added storyline, status, category, parent_game, release_dates
        const query = `
            fields name, slug, url, category, cover.image_id, first_release_date, summary, storyline, status, parent_game,
                   aggregated_rating, total_rating, total_rating_count, hypes,
                   involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                   screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name,
                   websites.url, websites.category, external_games.uid, external_games.category,
                   release_dates.platform.name, release_dates.date, release_dates.region;
            where first_release_date >= ${startDate} & first_release_date < ${endDate} & (total_rating_count >= 5 | hypes >= 2);
            limit ${BATCH_SIZE};
            offset ${offset};
        `;
        console.log("Querying IGDB with: " + query.replace(/\s+/g, ' '));

        const games = await fetchIgdb<IgdbGame & {
            category?: number,
            status?: number,
            storyline?: string,
            parent_game?: number,
            websites?: { category: number, url: string }[],
            external_games?: { category: number, uid: string }[],
            total_rating_count?: number,
            hypes?: number,
            release_dates?: { platform?: { name: string }, date?: number, region?: number }[]
        }>('games', query);

        if (games.length === 0) {
            console.log("Received 0 games, stopping.");
            hasMore = false;
            break;
        }

        console.log(`Fetched ${games.length} games.`);

        // Fetch TimeToBeat for this batch (ignore errors if endpoint is missing/broken)
        // Note: Disabling TTB fetch if it causes 404s to avoid log spam, or use try/catch
        const gameIds = games.map(g => g.id);
        const ttbQuery = `fields *; where game_id = (${gameIds.join(',')}); limit 500;`;
        let timeToBeatMap: Record<number, IgdbTimeToBeat> = {};

        if (gameIds.length > 0) {
            try {
                // Try 'game_time_to_beats' (plural) as per docs/convention
                const ttbResults = await fetchIgdb<IgdbTimeToBeat>('game_time_to_beats', ttbQuery);
                ttbResults.forEach(ttb => {
                    timeToBeatMap[ttb.game_id] = ttb;
                });
            } catch (e) {
                // Ignore TTB errors to keep script running
                // console.warn("TTB fetch failed, skipping times.");
            }
        }


        const processedGames = [];
        // Process art enrichment in parallel chunks
        const CHUNK_SIZE = 5;
        for (let i = 0; i < games.length; i += CHUNK_SIZE) {
            const chunk = games.slice(i, i + CHUNK_SIZE);
            const promises = chunk.map(async (game) => {
                let bestArt = null;
                try {
                    const releaseYear = game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : null;

                    // Optimization: If we already have good IGDB art, maybe we skip? 
                    // User thinks RAWG is better, so we ALWAYS try to find best art which might come from RAWG or Steam.
                    // However, to save time on 1000s of games, we could only do it if the game is popular?
                    // But we already filtered by popularity. So we do it for all.

                    bestArt = await findBestGameArt(game.name, releaseYear);
                } catch (e) {
                    // console.error(`Failed to find best art for ${game.name}`, e);
                }
                return { game, bestArt };
            });

            const results = await Promise.all(promises);
            processedGames.push(...results);

            // Small delay between chunks to be polite to APIs
            await new Promise(r => setTimeout(r, 100));
        }

        for (const { game, bestArt } of processedGames) {
            // Map Fields
            const id = game.id.toString();
            const title = game.name;

            // Default to IGDB provided art
            let coverImage = game.cover ? getIgdbImageUrl(game.cover.image_id, 'cover_big') : '';

            let backgroundImage = '';
            if (game.artworks && game.artworks.length > 0) {
                backgroundImage = getIgdbImageUrl(game.artworks[0].image_id, '1080p');
            } else if (game.screenshots && game.screenshots.length > 0) {
                backgroundImage = getIgdbImageUrl(game.screenshots[0].image_id, '1080p');
            }

            // OVERRIDE with Best Art if found (Steam > IGDB > RAWG) and looks valid
            // User specifically mentioned RAWG quality. findBestGameArt handles hierarchy.
            if (bestArt) {
                if (bestArt.cover) coverImage = bestArt.cover;
                if (bestArt.background) backgroundImage = bestArt.background;
            }

            const releaseDate = formatDate(game.first_release_date);
            const description = game.summary || '';

            const screenshots = game.screenshots ? JSON.stringify(game.screenshots.map(s => getIgdbImageUrl(s.image_id, 'screenshot_huge'))) : '[]';
            const videos = game.videos ? JSON.stringify(game.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`)) : '[]';

            // Websites / External
            let steamUrl = '';
            let steamAppId = '';

            const steamWebsite = game.websites?.find(w => w.category === 13);
            if (steamWebsite) steamUrl = steamWebsite.url;

            const steamExternal = game.external_games?.find(e => e.category === 1);
            if (steamExternal) {
                steamAppId = steamExternal.uid;
                if (!steamUrl) steamUrl = `https://store.steampowered.com/app/${steamExternal.uid}`;
            }

            const igdbUrl = game.url || '';
            const opencriticUrl = '';
            const hltbUrl = '';

            // Scores
            const igdbScore = game.total_rating ? Math.round(game.total_rating) : (game.aggregated_rating ? Math.round(game.aggregated_rating) : '');
            const opencriticScore = '';

            // Studio
            const studio = game.involved_companies?.find(c => c.developer)?.company.name || game.involved_companies?.[0]?.company.name || '';

            // Genres
            const genres = game.genres ? JSON.stringify(game.genres.map(g => g.name)) : '[]';

            // --- PLATFORMS with DATES ---
            const platformMap = new Map<string, string | null>();

            // 1. Populate from Release Dates (Best data)
            game.release_dates?.forEach(rd => {
                if (rd.platform && rd.date) {
                    const d = new Date(rd.date * 1000).toISOString();
                    // Keep earliest date for platform if multiple? Or specific region?
                    // Typically we want earliest global date, or regional?
                    // Let's just store the first one we find or overwrite, usually they are close.
                    // Ideally we'd filter for 'Worldwide' or 'North America' region but simpler is ok.
                    if (!platformMap.has(rd.platform.name)) {
                        platformMap.set(rd.platform.name, d);
                    } else {
                        // Optimization: Keep EARLIEST date
                        const existing = platformMap.get(rd.platform.name);
                        if (existing && d < existing) platformMap.set(rd.platform.name, d);
                    }
                }
            });

            // 2. Add remaining platforms (without dates)
            game.platforms?.forEach(p => {
                if (!platformMap.has(p.name)) {
                    platformMap.set(p.name, null);
                }
            });

            // 3. Serialize
            const platforms = JSON.stringify(Array.from(platformMap.entries()).map(([name, date]) => ({ name, releaseDate: date })));


            // Playtime
            const ttb = timeToBeatMap[game.id];
            const igdbTime = ttb ? JSON.stringify({ storyline: Math.round(ttb.normally / 60), completionist: Math.round(ttb.completely / 60) }) : '';

            const hltbMain = ttb ? Math.round(ttb.normally / 60) : '';
            const hltbExtra = '';
            const hltbCompletionist = ttb ? Math.round(ttb.completely / 60) : '';

            // Flags
            const dataMissing = 'false';
            const dataFetched = 'true';

            // DLC Logic: Category 1 (DLC), 2 (Expansion), 4 (Standalone Expansion)
            const cat = game.category ?? 0;
            const isDlc = (cat === 1 || cat === 2 || cat === 4) ? 'true' : 'false';

            // New Mapped Fields
            const storyline = game.storyline || '';
            const status = game.status !== undefined ? game.status.toString() : '';
            const gameType = game.category !== undefined ? game.category.toString() : '';

            // Parent ID: Store as just the number (or igdb-{id} format?)
            // Schema expects String. If we want to link Relations later, we should probably stick to `igdb-{id}` format if that's how we seed.
            // But CSV usually stores raw data. Let's store raw IGDB ID, script importing CSV handles relation connection.
            const parentId = game.parent_game ? game.parent_game.toString() : '';
            const relatedGames = ''; // We didn't fetch full related games, keeping empty for now to save query cost

            const row = [
                id, title, coverImage, backgroundImage, releaseDate, description,
                screenshots, videos, steamUrl, opencriticUrl, igdbUrl, hltbUrl,
                opencriticScore, igdbScore, steamAppId, '', '', '', isDlc,
                game.id.toString(), studio, genres, platforms, igdbTime,
                dataMissing, dataFetched, hltbMain, hltbExtra, hltbCompletionist,
                storyline, status, gameType, parentId, relatedGames
            ];

            writeStream.write(row.map(r => escapeCsv(r)).join('|') + '\n');
        }

        totalFetched += games.length;
        offset += BATCH_SIZE;

        // Rate Limit Handling
        await new Promise(res => setTimeout(res, 250));
    }

    writeStream.end();
    console.log(`\nFinished! Fetched ${totalFetched} games. CSV saved to ${csvPath}`);
}

main().catch(console.error);
