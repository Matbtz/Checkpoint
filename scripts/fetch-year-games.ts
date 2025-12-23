
import fs from 'fs';
import path from 'path';
import { fetchIgdb, getIgdbImageUrl, IgdbGame, IgdbTimeToBeat } from '../lib/igdb';

// --- Configuration ---
const BATCH_SIZE = 500;
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'csv');

// --- Helper Functions ---

function escapeCsv(field: any): string {
    if (field === null || field === undefined) return '';
    let str = String(field);
    // Replace " with ""
    str = str.replace(/"/g, '""');
    // If field contains comma, quote, or newline, wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
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
        "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist"
    ];

    const csvPath = path.join(OUTPUT_DIR, `games_${year}.csv`);
    const writeStream = fs.createWriteStream(csvPath);

    // Write Header
    writeStream.write(headers.map(h => escapeCsv(h)).join(',') + '\n');

    let offset = 0;
    let totalFetched = 0;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching batch starting at offset ${offset}...`);

        // Fetch ALL games (no category filter in where clause)
        // Included 'category' in fields to determine isDlc
        const query = `
            fields name, slug, url, category, cover.image_id, first_release_date, summary, aggregated_rating, total_rating,
                   involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                   screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name,
                   websites.url, websites.category, external_games.uid, external_games.category;
            where first_release_date >= ${startDate} & first_release_date < ${endDate};
            limit ${BATCH_SIZE};
            offset ${offset};
        `;

        const games = await fetchIgdb<IgdbGame & {
            category?: number,
            websites?: { category: number, url: string }[],
            external_games?: { category: number, uid: string }[]
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
                 // Try 'time_to_beats' (plural) as per docs/convention, fallback or ignore if 404
                 const ttbResults = await fetchIgdb<IgdbTimeToBeat>('time_to_beats', ttbQuery);
                 ttbResults.forEach(ttb => {
                     timeToBeatMap[ttb.game_id] = ttb;
                 });
            } catch (e) {
                // Ignore TTB errors to keep script running
                // console.warn("TTB fetch failed, skipping times.");
            }
        }

        for (const game of games) {
            // Map Fields
            const id = game.id.toString();
            const title = game.name;
            const coverImage = game.cover ? getIgdbImageUrl(game.cover.image_id, 'cover_big') : '';

            // Prioritize Artwork/Screenshot Huge for background
            let backgroundImage = '';
            if (game.artworks && game.artworks.length > 0) {
                backgroundImage = getIgdbImageUrl(game.artworks[0].image_id, '1080p');
            } else if (game.screenshots && game.screenshots.length > 0) {
                backgroundImage = getIgdbImageUrl(game.screenshots[0].image_id, '1080p');
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

            // Genres & Platforms
            const genres = game.genres ? JSON.stringify(game.genres.map(g => g.name)) : '[]';
            const platforms = game.platforms ? JSON.stringify(game.platforms.map(p => ({ name: p.name }))) : '[]';

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

            const row = [
                id, title, coverImage, backgroundImage, releaseDate, description,
                screenshots, videos, steamUrl, opencriticUrl, igdbUrl, hltbUrl,
                opencriticScore, igdbScore, steamAppId, '', '', '', isDlc,
                game.id.toString(), studio, genres, platforms, igdbTime,
                dataMissing, dataFetched, hltbMain, hltbExtra, hltbCompletionist
            ];

            writeStream.write(row.map(r => escapeCsv(r)).join(',') + '\n');
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
