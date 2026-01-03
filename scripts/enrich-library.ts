
import './env-loader';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames, getIgdbImageUrl, getIgdbTimeToBeat, getIgdbGameDetails, IgdbGame, EnrichedIgdbGame } from '../lib/igdb';
import { searchSteamStore, getSteamReviewStats } from '../lib/steam-store';
import { searchHowLongToBeat } from '../lib/hltb';
import { stringSimilarity } from '../lib/utils';

const prisma = new PrismaClient();
const DELAY_MS = 100; // Fast default delay

// --- Helper for Title Matching ---
function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Robust matching logic reusing Levenshtein distance
 */
function isMatch(localTitle: string, remoteTitle: string, localDate: Date | null, remoteYear: number | null): boolean {
    const nLocal = normalize(localTitle);
    const nRemote = normalize(remoteTitle);

    // Strict Title Check (0.85 threshold)
    const dist = stringSimilarity(nLocal, nRemote);
    const titleMatch = dist >= 0.85 || nLocal.includes(nRemote) || nRemote.includes(nLocal);

    if (!titleMatch) return false;

    // Date Check (if both available)
    if (localDate && remoteYear) {
        const localYear = localDate.getFullYear();
        // Allow +/- 1 year difference
        return Math.abs(localYear - remoteYear) <= 1;
    }

    return true;
}

// --- Modes ---
interface EnrichmentOptions {
    art: boolean;       // Covers (from Media)
    metadata: boolean;  // Desc, Genres, IGDB ID (from Media)
    steam: boolean;     // Steam ID, Reviews, URL (from Steam)
    opencritic: boolean; // OpenCritic Score (from OpenCritic)
    hltb: boolean;      // TimeToBeat (from HLTB scraper)
    refresh: boolean;   // Force update for recent/upcoming games
    scanDlc: boolean;   // Force check IGDB for DLC status
    csv: boolean;       // Export to CSV instead of DB update
    input?: string;     // Read from CSV input
    sortScore: boolean; // Sort by OpenCritic Score (desc)
    sortRecent: boolean;// Sort by Release Date (desc)
}

function parseCsvLine(line: string, delimiter: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

function readCsv(filePath: string): any[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];

    // Detect delimiter from header
    const headerLine = lines[0];
    const delimiter = headerLine.includes('|') ? '|' : ',';

    const headers = parseCsvLine(headerLine, delimiter).map(h => h.trim());

    const data: any[] = [];
    for (let i = 1; i < lines.length; i++) {
        // Handle multiline quotes? Rough handling: assume one line per record for now as per our writers
        // If robust needed, we'd need state machine across lines. 
        // Given 'fetch-year-games' replaces newlines, we assume safe.
        const values = parseCsvLine(lines[i], delimiter);
        const row: any = {};
        headers.forEach((h, idx) => {
            let val: any = values[idx] || null;
            if (val === '') val = null;

            // Auto-parse JSON columns
            if (val && (h === 'platforms' || h === 'genres' || h === 'screenshots' || h === 'videos' || h === 'relatedGames' || h === 'igdbTime')) {
                try {
                    if (val.startsWith('[') || val.startsWith('{')) val = JSON.parse(val);
                } catch (e) { }
            }
            // Parse Dates
            if (val && (h === 'releaseDate' || h === 'updatedAt')) {
                const d = new Date(val);
                if (!isNaN(d.getTime())) val = d;
            }
            // Parse Numbers
            if (val && (h === 'opencriticScore' || h === 'igdbScore' || h === 'steamReviewCount' || h === 'hltbMain')) {
                if (!isNaN(Number(val))) val = Number(val);
            }
            // Booleans
            if (val && (h === 'isDlc' || h === 'dataFetched' || h === 'dataMissing')) {
                val = val === 'true' || val === true;
            }

            row[h] = val;
        });

        // Ensure minimal Game fields ID/Title
        if (row.id && row.title) {
            data.push(row);
        }
    }
    return data;
}

async function main() {
    const args = process.argv.slice(2);

    // Parse Input
    const inputArg = args.find(a => a.startsWith('--input='));
    const inputPath = inputArg ? inputArg.split('=')[1] : undefined;

    // Parse Arguments
    const options: EnrichmentOptions = {
        art: args.includes('--full') || args.includes('--quick') || args.includes('--art') || args.includes('--refresh-recent') || (!args.length),
        metadata: args.includes('--full') || args.includes('--metadata') || args.includes('--refresh-recent') || (!args.length),
        steam: args.includes('--full') || args.includes('--reviews') || args.includes('--steam') || args.includes('--refresh-recent') || (!args.length),
        opencritic: args.includes('--full') || args.includes('--opencritic') || args.includes('--refresh-recent'),
        hltb: args.includes('--hltb'),
        csv: args.includes('--csv') || !!inputPath, // Force CSV export if input is CSV
        input: inputPath,
        refresh: args.includes('--refresh-recent'),
        scanDlc: args.includes('--scan-dlc'),
        sortScore: args.includes('--sort-score'),
        sortRecent: args.includes('--sort-recent')
    };

    const isContinue = args.includes('--continue');
    const STATE_FILE = path.resolve(process.cwd(), 'scripts/sync-state-hltb.json');

    // Load State if Continuing
    let processedIds: string[] = [];
    if (isContinue && fs.existsSync(STATE_FILE)) {
        try {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            if (Array.isArray(state.processedIds)) {
                processedIds = state.processedIds;
                console.log(`⏩ CONTINUE MODE: Found ${processedIds.length} previously processed games in state file.`);
            }
        } catch (e) {
            console.error("⚠️ Failed to load state file, starting fresh.");
        }
    } else if (!isContinue) {
        // If not continuing, maybe clear the file? Or just overwrite on save?
        // User might want to "accumulate" runs manually, but usually new run = fresh start unless --continue
        if (fs.existsSync(STATE_FILE)) {
            try { fs.unlinkSync(STATE_FILE); } catch (e) { /* ignore */ }
        }
    }

    const resumeFromArg = args.find(a => a.startsWith('--resume-from='));
    const resumeFrom = resumeFromArg ? parseInt(resumeFromArg.split('=')[1]) : 1;

    console.log("🎮 Master Library Enricher");
    console.log("-----------------------");
    console.log(`Modes active: ${Object.keys(options).filter(k => options[k as keyof EnrichmentOptions]).join(', ')}`);
    if (isContinue) console.log(`⏩ Skipping ${processedIds.length} games from state file.`);
    if (resumeFrom > 1) console.log(`⏩ Resuming from index: ${resumeFrom}`);

    // --- 1. Select Games & Determine Headers ---
    let games: any[] = [];
    let outputHeaders: string[] = [
        "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
        "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
        "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
        "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
        "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
        "storyline", "status", "gameType", "parentId", "relatedGames"
    ];

    // --- CSV SETUP ---
    let csvStream: fs.WriteStream | null = null;
    if (options.csv) {
        const csvPath = path.join(process.cwd(), 'scripts', 'csv', 'enrich_results.csv');
        // Ensure dir
        if (!fs.existsSync(path.dirname(csvPath))) fs.mkdirSync(path.dirname(csvPath), { recursive: true });

        csvStream = fs.createWriteStream(csvPath);

        const escapeCsv = (field: any): string => {
            if (field === null || field === undefined) return '';
            let str = String(field);
            str = str.replace(/[\r\n]+/g, ' ');
            str = str.replace(/"/g, '""');
            if (str.includes('|') || str.includes('"')) return `"${str}"`;
            return str;
        };

        csvStream.write(outputHeaders.map(h => escapeCsv(h)).join('|') + '\n');
        console.log(`📝 CSV Export enabled: ${csvPath}`);
    }

    if (options.input) {
        // Read from CSV
        const fullPath = path.resolve(process.cwd(), options.input);
        if (!fs.existsSync(fullPath)) {
            console.error(`❌ Input file not found: ${fullPath}`);
            return;
        }
        console.log(`📂 Reading input CSV: ${fullPath}`);
        games = readCsv(fullPath);
        // Apply Filters roughly? Or process all?
        // EnrichedLibrary usually processes all unless resume/continue skipping
        // We can apply whereClause filters in memory if needed, but usually we want to process the file provided.
        // Let's filter slightly based on mode to save time if needed?
        // No, let's process all in the file for now.
    } else {
        // DB Fetch
        // 1. Select Games
        let whereClause: any = {};

        if (options.scanDlc) {
            whereClause = { igdbId: { not: null } };
            console.log("🔍 DLC Scan Mode: Checking games with IGDB ID for DLC status...");
        } else if (options.refresh) {
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            whereClause = { releaseDate: { gte: threeMonthsAgo } };
            console.log(`🔄 Refresh Mode: Targeting games released after ${threeMonthsAgo.toISOString().split('T')[0]}`);
        } else {
            const conditions = [];
            if (options.art) conditions.push({ coverImage: null }, { backgroundImage: null });
            if (options.metadata) conditions.push({ description: null }, { description: "" }, { igdbId: null });
            if (options.steam) conditions.push({ steamAppId: null }, { steamReviewScore: null });
            if (options.hltb) {
                if (options.refresh) {
                    const oneYearAgo = new Date();
                    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                    conditions.push({ hltbMain: null }, { releaseDate: { gte: oneYearAgo } });
                } else {
                    conditions.push({ hltbMain: null });
                }
            }
            if (conditions.length > 0) whereClause = { OR: conditions };
        }

        // Global Filter: Exclude Unreleased Games
        whereClause = {
            AND: [
                whereClause,
                {
                    OR: [
                        { releaseDate: null },
                        { releaseDate: { lte: new Date() } }
                    ]
                }
            ]
        };

        let orderBy: any = { updatedAt: 'asc' };
        if (options.sortScore) orderBy = { opencriticScore: { sort: 'desc', nulls: 'last' } };
        if (options.sortRecent) orderBy = { releaseDate: { sort: 'desc', nulls: 'last' } };

        games = await prisma.game.findMany({
            where: whereClause,
            orderBy: orderBy
        });
    }

    console.log(`🎯 Targets identified: ${games.length} games.`);
    let processed = 0;
    let updated = 0;

    let currentPause = 180000; // Start with 3 minutes

    for (const game of games) {
        // Check resume
        if (processed + 1 < resumeFrom) {
            processed++;
            continue;
        }

        // Check Continue State
        if (isContinue && processedIds.includes(game.id)) {
            // console.log(`   ⏩ Skipped (Already Processed): ${game.title}`);
            processed++;
            continue;
        }

        process.stdout.write(`\n[${processed + 1}/${games.length}] ${game.title} `);
        const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
        if (releaseYear) process.stdout.write(`(${releaseYear})`);
        console.log("");

        const updateData: any = {}; // Typed specifically in your codebase usually
        let dataFound = false;

        let hltbRequestMade = false;

        // --- A. IGDB & ART ENRICHMENT ---
        if (options.art || options.metadata || options.scanDlc) {
            try {
                // ... art finding logic ...
                const art = !options.scanDlc ? await findBestGameArt(game.title, releaseYear) : null;
                // Skip art search in DLC scan mode to be faster? Or keep it?
                // User said "enrich-library", implying standard behavior.
                // But for DLC scan we mainly want IGDB Data. 
                // Let's keep art logic if flags are on, but if strictly --scan-dlc we might skip if we only want DLC check.
                // Actually, let's just make art optional in the variable assignment above.

                if (art) {
                    // ... apply art ...
                    if (options.art) {
                        if (!game.coverImage || options.refresh) {
                            if (art.cover) { updateData.coverImage = art.cover; dataFound = true; }
                        }
                        if (!game.backgroundImage || options.refresh) {
                            if (art.background) { updateData.backgroundImage = art.background; dataFound = true; }
                        }
                    }
                }

                // 2. Resolve IGDB Data
                let igdbData: EnrichedIgdbGame | IgdbGame | null = null;

                // FORCE FETCH BY ID for DLC Scan or if we have an ID and need refresh
                if ((options.scanDlc || options.refresh) && game.igdbId) {
                    const { getIgdbGameDetails } = require('../lib/igdb'); // Lazy import or ensure it's imported
                    igdbData = await getIgdbGameDetails(parseInt(game.igdbId));
                    if (options.scanDlc && igdbData) {
                        const cat = igdbData.game_type ?? igdbData.category ?? 0;
                        const catName = cat === 0 ? 'Main' : (cat === 1 ? 'DLC' : (cat === 2 ? 'Expansion' : cat));
                        console.log(`   🔎 IGDB Check: ${catName} | Parent: ${igdbData.parent_game?.name || 'None'}`);
                    }
                }
                // ... existing fallback to art match ...
                else if (art?.source === 'igdb' && art.originalData) {
                    igdbData = art.originalData as EnrichedIgdbGame;
                }
                // ... existing search by title ...
                else if (options.metadata && !game.igdbId) {
                    // ... search logic ...
                    const igdbResults = await searchIgdbGames(game.title, 1);
                    if (igdbResults.length > 0) {
                        const candidate = igdbResults[0];
                        const cYear = candidate.first_release_date ? new Date(candidate.first_release_date * 1000).getFullYear() : null;
                        if (isMatch(game.title, candidate.name, game.releaseDate, cYear)) {
                            igdbData = candidate;
                        }
                    }
                }
                // If we already have an IGDB ID in DB, we could fetch details if doing a refresh?
                // (Skipping for now to avoid over-fetching, unless refresh is strict)

                // 3. Apply IGDB Metadata
                if (igdbData && (options.metadata || options.scanDlc)) {
                    if ((!game.description || options.refresh) && igdbData.summary) {
                        updateData.description = igdbData.summary; dataFound = true;
                    }

                    if (!game.igdbId) {
                        const newId = String(igdbData.id);
                        // Check collision
                        const exists = await prisma.game.findUnique({ where: { igdbId: newId } });
                        if (!exists || exists.id === game.id) {
                            updateData.igdbId = newId;
                            dataFound = true;
                        }
                    }

                    if ((!game.igdbScore || options.refresh) && (igdbData.total_rating || igdbData.aggregated_rating)) {
                        updateData.igdbScore = Math.round(igdbData.total_rating || igdbData.aggregated_rating!);
                        dataFound = true;
                    }

                    if ((!game.igdbUrl || options.refresh) && igdbData.url) {
                        updateData.igdbUrl = igdbData.url; dataFound = true;
                    }

                    // Release Date Update (Important for delays)
                    if (options.refresh && igdbData.first_release_date) {
                        const newDate = new Date(igdbData.first_release_date * 1000);
                        // Compare just the days to avoid time drift issues
                        if (!game.releaseDate || newDate.toISOString().split('T')[0] !== game.releaseDate.toISOString().split('T')[0]) {
                            updateData.releaseDate = newDate;
                            dataFound = true;
                            console.log(`   📅 Release Date Adjusted: ${newDate.toISOString().split('T')[0]}`);
                        }
                    }

                    // Videos / Screens / TimeToBeat
                    // Only update specialized fields on refresh or if empty? Let's be aggressive if we found data.
                    if (igdbData.screenshots?.length) {
                        updateData.screenshots = igdbData.screenshots.map(s => getIgdbImageUrl(s.image_id, '1080p'));
                        dataFound = true;
                    }
                    if (igdbData.videos?.length) {
                        updateData.videos = igdbData.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`);
                        dataFound = true;
                    }

                    // Time To Beat (from IGDB)
                    try {
                        const timeData = await getIgdbTimeToBeat(igdbData.id);
                        if (timeData) {
                            updateData.igdbTime = {
                                hastly: timeData.hastly,
                                normally: timeData.normally,
                                completely: timeData.completely
                            };
                            dataFound = true;
                        }
                    } catch (e) { /* ignore */ }

                    if (igdbData.storyline) {
                        updateData.storyline = igdbData.storyline; dataFound = true;
                    }
                    if (igdbData.status !== undefined) {
                        updateData.status = igdbData.status; dataFound = true;
                    }
                    if (igdbData.game_type !== undefined) {
                        updateData.gameType = igdbData.game_type; dataFound = true;
                    }

                    // Consolidated Related Games JSON
                    const relatedGames: any = {};
                    if (igdbData.dlcs?.length) relatedGames.dlcs = igdbData.dlcs;
                    if (igdbData.expansions?.length) relatedGames.expansions = igdbData.expansions;
                    if (igdbData.remakes?.length) relatedGames.remakes = igdbData.remakes;
                    if (igdbData.remasters?.length) relatedGames.remasters = igdbData.remasters;
                    if (igdbData.expanded_games?.length) relatedGames.expanded_games = igdbData.expanded_games; // Inverse of expansion

                    if (Object.keys(relatedGames).length > 0) {
                        updateData.relatedGames = relatedGames;
                        dataFound = true;
                    }

                    // 4. DLC / Parent Linking (New)
                    // Simplified Mode: TRUST `game_type` (1=DLC, 2=Expansion)
                    // Users confirmed game_type is reliable. We ignore heuristics.
                    const typeId = igdbData.game_type ?? igdbData.category;
                    let isDlcCandidate = typeId === 1 || typeId === 2;

                    // Safety Checks just for self-referencing integrity (prevent ID loop)
                    if (isDlcCandidate && igdbData.parent_game) {
                        // 1. Check for Self-Reference (ID)
                        if (igdbData.parent_game.id === igdbData.id) {
                            isDlcCandidate = false;
                        }
                    }

                    if (isDlcCandidate) {
                        updateData.isDlc = true;
                        // Try to find parent if sent
                        if (igdbData.parent_game) {
                            const parent = await prisma.game.findFirst({
                                where: { title: igdbData.parent_game.name },
                                select: { id: true }
                            });
                            if (parent) {
                                // Double check we aren't linking to ourselves (via DB ID) just in case
                                if (parent.id !== game.id) {
                                    updateData.parentId = parent.id;
                                    console.log(`   🔗 Linked to Parent: ${igdbData.parent_game.name}`);
                                }
                            }
                        }
                    }
                }

            } catch (e) {
                console.error(`   ⚠️ Error in Art/Metadata enrichment:`, e);
            }
        }

        // --- B. STEAM ENRICHMENT ---
        // (Combines logic from enrich-steam.ts)
        if (options.steam) {
            let steamId = game.steamAppId ? parseInt(game.steamAppId) : null;
            let foundNewId = false;

            // 1. Find ID if missing
            if (!steamId) {
                try {
                    const results = await searchSteamStore(game.title);
                    const match = results.find(r => isMatch(game.title, r.name, game.releaseDate, r.releaseYear));
                    if (match) {
                        steamId = match.id;
                        foundNewId = true;
                        console.log(`   🚂 Steam ID Found: ${steamId}`);
                    }
                } catch (e) { /* ignore */ }
            }

            // 2. Fetch Stats
            if (steamId) {
                try {
                    // Only fetch specific stats if missing or refreshing
                    if (!game.steamReviewScore || options.refresh) {
                        const stats = await getSteamReviewStats(steamId);
                        if (stats) {
                            updateData.steamUrl = `https://store.steampowered.com/app/${steamId}`;
                            updateData.steamReviewScore = stats.scoreDesc;
                            updateData.steamReviewCount = stats.totalReviews;
                            updateData.steamReviewPercent = stats.percentPositive;
                            dataFound = true;

                            console.log(`   🚂 Reviews: ${stats.scoreDesc} (${stats.percentPositive}%)`);
                        }
                    }

                    if (foundNewId) {
                        // Check collision
                        const exists = await prisma.game.findUnique({ where: { steamAppId: String(steamId) } });
                        if (!exists || exists.id === game.id) {
                            updateData.steamAppId = String(steamId);
                            dataFound = true;
                        }
                    }

                } catch (e) { console.error(`   ⚠️ Error fetching Steam stats:`, e); }
            }
        }

        // --- B2. OPENCRITIC ENRICHMENT ---
        if (options.opencritic) {
            // Only fetch if missing or refresh
            if (game.opencriticScore === null || options.refresh) {
                try {
                    const { getOpenCriticScore } = require('../lib/opencritic'); // Lazy load
                    const ocData = await getOpenCriticScore(game.title);

                    if (ocData && ocData.score !== null) {
                        updateData.opencriticScore = ocData.score;
                        if (ocData.url && !game.opencriticUrl) {
                            updateData.opencriticUrl = ocData.url;
                        }
                        dataFound = true;
                        console.log(`   🏆 OpenCritic: ${ocData.score}`);
                    }
                } catch (e: any) {
                    console.error(`   ⚠️ Error fetching OpenCritic:`, e.message || e);
                }
            }
        }

        // --- C. HLTB ENRICHMENT ---
        if (options.hltb) {
            // Check if game is unreleased
            const isUnreleased = game.releaseDate && game.releaseDate > new Date();

            if (isUnreleased) {
                // console.log(`   ⏳ Skipping unreleased: ${game.title}`);
            }
            // Only fetch if missing or refresh and RELEASED
            else if (!game.hltbMain || options.refresh) {
                hltbRequestMade = true;
                try {
                    const hltbResult = await searchHowLongToBeat(game.title);
                    if (hltbResult) {
                        updateData.hltbMain = hltbResult.main;
                        updateData.hltbExtra = hltbResult.extra;
                        updateData.hltbCompletionist = hltbResult.completionist;
                        if (hltbResult.url) {
                            updateData.hltbUrl = hltbResult.url;
                        }

                        // URL is not returned by current scraper, but we could infer or update lib/hltb to return it
                        // For now we just save times
                        dataFound = true;
                        console.log(`   ⏱️ HLTB: Main ${Math.round(hltbResult.main / 60)}h | Extra ${Math.round(hltbResult.extra / 60)}h`);
                        currentPause = 180000; // Reset backoff on success
                    }
                } catch (e: any) {
                    if (e.message && e.message.includes('429')) {
                        console.warn(`   🛑 Rate Limit (429) hit. Pausing for ${Math.round(currentPause / 1000)}s...`);
                        await new Promise(r => setTimeout(r, currentPause));
                        currentPause += 120000; // Add 2 minutes for next time if it fails again
                    } else {
                        console.error(`   ⚠️ Error fetching HLTB:`, e.message || e);
                    }
                }
            }
        }

        // --- MERGE FOR CSV ---
        const finalGameData: any = { ...game, ...updateData };

        // --- SAVE TO DB OR CSV ---
        if (options.csv && csvStream) {
            const escapeCsv = (field: any): string => {
                if (field === null || field === undefined) return '';
                let str = String(field);
                if (typeof field === 'object') str = JSON.stringify(field); // For JSON fields
                str = str.replace(/[\r\n]+/g, ' ');
                str = str.replace(/"/g, '""');
                if (str.includes('|') || str.includes('"')) return `"${str}"`;
                return str;
            };

            // Map finalGameData to row using OUTPUT HEADERS
            // Note: finalGameData contains ALL merged fields (input + updates)
            const row = outputHeaders.map(h => finalGameData[h]);
            csvStream.write(row.map(r => escapeCsv(r)).join('|') + '\n');
            // console.log(`   📝 Written to CSV.`);
        } else if (Object.keys(updateData).length > 0) {
            await prisma.game.update({
                where: { id: game.id },
                data: {
                    ...updateData,
                    dataFetched: true,
                    updatedAt: new Date() // Always update timestamp
                }
            });
            const changes = Object.keys(updateData).map(k => {
                let val = updateData[k];
                if (k === 'relatedGames') val = `[${Object.keys(val).join(', ')}]`;
                if (k === 'gameType' || k === 'isDlc') return `${k}=${val}`;
                if (k === 'relatedGames') return `${k}=${val}`;
                return k;
            }).join(', ');
            console.log(`   💾 Updated: ${changes}`);
            updated++;
        } else {
            console.log("   ⏺️ No relevant updates found.");
        }

        // Update State
        if (!processedIds.includes(game.id)) {
            processedIds.push(game.id);
            // Save state periodically or every time? Every time is safer for "crash proofing"
            try {
                fs.writeFileSync(STATE_FILE, JSON.stringify({ processedIds, lastUpdated: new Date().toISOString() }, null, 2));
            } catch (e) {
                // ignore write error
            }
        }

        // Dynamic Delay
        let delay = DELAY_MS;
        if (options.hltb && hltbRequestMade) {
            delay = 10000 + Math.random() * 3000; // 10-13s for scraping
        }

        processed++;
        await new Promise(r => setTimeout(r, delay));
    }

    console.log(`\n🏁 Finished. Updated ${updated} of ${processed} games.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
