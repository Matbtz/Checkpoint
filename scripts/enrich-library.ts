
import './env-loader';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames, getIgdbImageUrl, getIgdbTimeToBeat, getIgdbGameDetails, IgdbGame, EnrichedIgdbGame } from '../lib/igdb';
import { searchRawgGames, getRawgGameDetails, RawgGame } from '../lib/rawg';
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
    const content = fs.readFileSync(filePath, 'utf-8').replace(/X\|S/g, 'X/S');
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
                // Fix: Handle truncated ISO strings by taking just YYYY-MM-DD
                const datePart = typeof val === 'string' && val.includes('T') ? val.split('T')[0] : val;
                const d = new Date(datePart);
                if (!isNaN(d.getTime())) val = d;
                else val = null;
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

// Helper to normalize genres (e.g. "Role-Playing Game" -> "RPG")
function normalizeGenre(g: string): string {
    const lower = g.toLowerCase().trim();
    if (lower === 'role-playing game' || lower === 'role playing game' || lower === 'rpg') return 'RPG';
    if (lower === 'sci-fi' || lower === 'science fiction') return 'Sci-Fi';
    if (lower === 'beat \'em up' || lower === 'beat em up') return 'Beat \'em up';
    if (lower === 'shoot \'em up' || lower === 'shoot em up' || lower === 'shmup') return 'Shoot \'em up';
    return g; // Keep original casing if no match, or capitalize? IGDB/RAWG usually good casing.
}

async function main() {
    const args = process.argv.slice(2);

    // Parse Input
    const inputArg = args.find(a => a.startsWith('--input='));
    const inputPath = inputArg ? inputArg.split('=')[1] : (args.includes('--csv') ? 'scripts/csv/enriched_clean_dataset.csv' : undefined);

    // Parse Arguments
    const options: EnrichmentOptions = {
        art: args.includes('--full') || args.includes('--quick') || args.includes('--art') || (!args.length),
        metadata: args.includes('--full') || args.includes('--metadata') || args.includes('--refresh-recent') || (!args.length),
        steam: args.includes('--full') || args.includes('--reviews') || args.includes('--steam') || (!args.length),
        opencritic: args.includes('--full') || args.includes('--opencritic'),
        hltb: args.includes('--hltb'),
        csv: args.includes('--csv') || !!inputPath, // Force CSV export if input is CSV
        input: inputPath,
        refresh: args.includes('--refresh-recent'),
        scanDlc: args.includes('--scan-dlc'),
        sortScore: args.includes('--sort-score'),
        sortRecent: args.includes('--sort-recent')
    };
    const useRawg = options.metadata || args.includes('--rawg');

    const isContinue = args.includes('--continue');
    const STATE_FILE = path.resolve(process.cwd(), 'scripts/sync-state-hltb.json');

    // Load State if Continuing
    // Load State if Continuing
    let processedIds: string[] = [];

    // Format helper to extract IDs from CSV
    const loadCsvIds = (filePath: string): string[] => {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            // Skip header if present (assuming ID is first column)
            // Header: id|title|...
            const ids: string[] = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                // Split by pipe (or whatever separator logic, but usually pipe for us)
                // We handle quotes? Simple split is risky if ID has pipe, but IDs shouldn't.
                // Assuming ID is first and usually safe.
                const firstCol = line.split('|')[0];
                if (firstCol) ids.push(firstCol.replace(/"/g, '')); // Remove quotes if any
            }
            return ids;
        } catch (e) { return []; }
    };

    if (isContinue) {
        // Priority 1: Check CSV Output if in CSV mode
        const csvOutPath = path.join(process.cwd(), 'scripts', 'csv', 'enriched_library.csv');
        if (options.csv && fs.existsSync(csvOutPath)) {
            console.log(`📂 Reading existing output CSV to resume: ${csvOutPath}`);
            processedIds = loadCsvIds(csvOutPath);
            console.log(`⏩ Found ${processedIds.length} already processed games.`);
        }
        // Priority 2: State File (Fallback or legacy)
        else if (fs.existsSync(STATE_FILE)) {
            try {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
                if (Array.isArray(state.processedIds)) {
                    processedIds = state.processedIds;
                    console.log(`⏩ CONTINUE MODE: Found ${processedIds.length} previously processed games in state file.`);
                }
            } catch (e) {
                console.error("⚠️ Failed to load state file, starting fresh.");
            }
        }
    } else {
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

    // --- Circuit Breakers ---
    let skipRawg = false;
    let skipOpenCritic = false;
    let skipHltb = false; // Optional, might as well add it? No user asked for Rawg/OC.

    // --- 1. Select Games & Determine Headers ---
    let games: any[] = [];
    let outputHeaders: string[] = [
        "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
        "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
        "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
        "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
        "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
        "storyline", "summary", "status", "gameType", "parentId", "relatedGames", "franchise",
        "hypes", "keywords", "dlcs", "ports", "remakes", "remasters"
    ];

    // --- CSV SETUP ---
    let csvStream: fs.WriteStream | null = null;
    if (options.csv) {
        const csvPath = path.join(process.cwd(), 'scripts', 'csv', 'enriched_library.csv');
        // Ensure dir
        if (!fs.existsSync(path.dirname(csvPath))) fs.mkdirSync(path.dirname(csvPath), { recursive: true });

        const flags = (isContinue && fs.existsSync(csvPath)) ? 'a' : 'w';
        csvStream = fs.createWriteStream(csvPath, { flags });

        const escapeCsv = (field: any): string => {
            if (field === null || field === undefined) return '';
            let str = String(field);
            str = str.replace(/[\r\n]+/g, ' ');
            str = str.replace(/"/g, '""');
            if (str.includes('|') || str.includes('"')) return `"${str}"`;
            return str;
        };

        // Write header only if NOT appending
        if (flags === 'w') {
            csvStream.write(outputHeaders.map(h => escapeCsv(h)).join('|') + '\n');
        }
        console.log(`📝 CSV Export enabled: ${csvPath} (Mode: ${flags === 'a' ? 'Append' : 'Overwrite'})`);
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
            if (options.metadata) conditions.push({ description: null }, { description: "" }, { igdbId: null }, { studio: null });
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
        try {
            // Check resume
            if (processed + 1 < resumeFrom) {
                processed++;
                continue;
            }

            // Check Continue State
            if (isContinue && processedIds.includes(game.id)) {
                processed++;
                continue;
            }

            process.stdout.write(`\n[${processed + 1}/${games.length}] ${game.title} `);
            const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
            if (releaseYear) process.stdout.write(`(${releaseYear})`);
            console.log("");

            const updateData: any = {};
            const updatesLog: string[] = []; // Track what changed
            let dataFound = false;

            let hltbRequestMade = false;
            let rawgRequestMade = false;
            let forceRefresh = false;

            // --- A. IGDB & ART ENRICHMENT ---
            if (options.art || options.metadata || options.scanDlc) {
                try {
                    // Check if we should skip RAWG in findBestGameArt
                    const excluded = skipRawg ? ['rawg'] : [];
                    const art = !options.scanDlc ? await findBestGameArt(game.title, releaseYear, excluded) : null;

                    if (art) {
                        if (options.art) {
                            if (!game.coverImage || options.refresh) {
                                if (art.cover) { updateData.coverImage = art.cover; dataFound = true; updatesLog.push("Cover Art"); }
                            }
                            if (!game.backgroundImage || options.refresh) {
                                if (art.background) { updateData.backgroundImage = art.background; dataFound = true; updatesLog.push("Background"); }
                            }
                        }
                    }

                    // 2. Resolve IGDB Data
                    let igdbData: EnrichedIgdbGame | IgdbGame | null = null;


                    if ((options.scanDlc || options.refresh) && game.igdbId) {
                        const { getIgdbGameDetails } = require('../lib/igdb');
                        igdbData = await getIgdbGameDetails(parseInt(game.igdbId));
                        if (options.scanDlc && igdbData) {
                            const cat = igdbData.game_type ?? igdbData.category ?? 0;
                            const catName = cat === 0 ? 'Main' : (cat === 1 ? 'DLC' : (cat === 2 ? 'Expansion' : cat));
                            console.log(`   🔎 IGDB Check: ${catName} | Parent: ${igdbData.parent_game?.name || 'None'}`);

                            // NEW: If we found a Bundle, Pack, or Update (and didn't ask for one), assume ID is wrong and re-search.
                            // Types: 3=Bundle, 13=Pack, 14=Update. Also 1=DLC (if title doesn't say DLC).
                            const badTypes = [3, 13, 14];
                            let isBad = badTypes.includes(cat);

                            // Check DLC/Expansion mismatch
                            if (!isBad && (cat === 1 || cat === 2)) {
                                const nLocal = normalize(game.title);
                                const nRemote = normalize(igdbData.name);
                                // If titles are significantly different, assume it's a wrong match (e.g. matching a random DLC for the same game).
                                // But if matches, KEEP IT (e.g. Shadowbringers is a valid Expansion).
                                if (nLocal !== nRemote && !nLocal.includes(nRemote) && !nRemote.includes(nLocal)) {
                                    // Check similarity just in case
                                    const { stringSimilarity } = require('../lib/utils');
                                    if (stringSimilarity(nLocal, nRemote) < 0.9) {
                                        isBad = true;
                                    }
                                }
                            }

                            if (isBad) {
                                console.log(`   ⚠️ Existing ID points to Type ${cat} (${catName}). Re-searching for Main Game...`);
                                game.igdbId = null; // Clear ID to force search
                                igdbData = null;    // Clear data
                                forceRefresh = true; // Force overwrite of metadata since ID was wrong
                            }
                        }
                    }

                    if (art?.source === 'igdb' && art.originalData && !igdbData) {
                        igdbData = art.originalData as EnrichedIgdbGame;
                    }

                    if (options.metadata && !igdbData) {
                        const igdbResults = await searchIgdbGames(game.title, 25);
                        // Implement Scored Selection
                        if (igdbResults.length > 0) {
                            let bestCandidate = null;
                            let bestScore = -1;

                            for (const res of igdbResults) {
                                const cYear = res.first_release_date ? new Date(res.first_release_date * 1000).getFullYear() : null;
                                const titleMatch = isMatch(game.title, res.name, game.releaseDate, cYear);

                                let score = 0; // Initialize score for the current candidate

                                // Simplified Rules:
                                // 1. Game Type Filter/Penalty
                                // 0=Main, 4=Standalone, 10=Expanded, 8=Remake, 9=Remaster
                                // 1=DLC, 2=Expansion
                                // 3=Bundle, 11=Port, 12=Fork, 13=Pack, 14=Update

                                const type = res.category ?? res.game_type ?? 0;
                                let typeScore = 0;

                                // Heavy Penalty for Bundles/Packs to ensure Main game wins even with date mismatch
                                if (type === 3 || type === 13 || type === 14) {
                                    typeScore = -100;
                                } else if (type === 1 || type === 2) {
                                    // Soft penalty for DLC (unless name match overrides later)
                                    typeScore = -20;
                                }

                                score += typeScore;

                                // 3. Date Match Bonus (+50/-30)
                                if (cYear && game.releaseDate) {
                                    const localYear = new Date(game.releaseDate).getFullYear();
                                    const diff = Math.abs(localYear - cYear);
                                    if (diff === 0) score += 60; // Perfect Year Match
                                    else if (diff <= 1) score += 50; // Close Match
                                    else score -= 30;
                                }

                                // Special Case: If local title contains "DLC" or "Pass", offset DLC penalty
                                if (game.title.toLowerCase().includes('dlc') || game.title.toLowerCase().includes('season pass')) {
                                    if (type === 1 || type === 2) score += 50;
                                }

                                if (score > bestScore) {
                                    bestScore = score;
                                    bestCandidate = res;
                                } else if (score === bestScore) {
                                    // Tie-breaker: Prefer Main Game (0) > Remake (8) > DLC (1) > Bundle (14)
                                    const typeA = bestCandidate ? (bestCandidate.category ?? bestCandidate.game_type ?? 0) : 100;
                                    const typeB = res.category ?? res.game_type ?? 0;

                                    // Priority Map (Lower is better)
                                    const priority = (t: number) => {
                                        if (t === 0) return 0; // Main
                                        if (t === 8 || t === 9) return 1; // Remake/Remaster
                                        if (t === 4 || t === 10) return 2; // Standalone/Expanded
                                        if (t === 1 || t === 2) return 3; // DLC
                                        return 4; // Other (Bundles/Ports)
                                    };

                                    if (priority(typeB) < priority(typeA)) {
                                        bestCandidate = res;
                                    }
                                }
                            }

                            if (bestCandidate) {
                                igdbData = bestCandidate;
                            }
                        }
                    }

                    // 3. Apply IGDB Metadata
                    if (igdbData && (options.metadata || options.scanDlc)) {
                        if ((!game.description || options.refresh || forceRefresh) && igdbData.summary) {
                            updateData.description = igdbData.summary; dataFound = true; updatesLog.push("Description");
                        }

                        if (!game.igdbId) {
                            const newId = String(igdbData.id);
                            let exists = null;
                            if (!options.csv) exists = await prisma.game.findUnique({ where: { igdbId: newId } });

                            if (!exists || exists.id === game.id) {
                                updateData.igdbId = newId;
                                dataFound = true;
                                updatesLog.push(`IGDB ID (${newId})`);
                            }
                        }

                        if ((!game.igdbScore || options.refresh || forceRefresh) && (igdbData.total_rating || igdbData.aggregated_rating)) {
                            updateData.igdbScore = Math.round(igdbData.total_rating || igdbData.aggregated_rating!);
                            dataFound = true;
                            updatesLog.push(`IGDB Score (${updateData.igdbScore})`);
                        }

                        if ((!game.igdbUrl || options.refresh || forceRefresh) && igdbData.url) {
                            updateData.igdbUrl = igdbData.url; dataFound = true; updatesLog.push("IGDB URL");
                        }

                        // Release Date Update (Important for delays)
                        if ((!game.releaseDate || options.refresh || forceRefresh) && igdbData.first_release_date) {
                            const newDate = new Date(igdbData.first_release_date * 1000);
                            // Compare just the days to avoid time drift issues
                            if (!game.releaseDate || newDate.toISOString().split('T')[0] !== game.releaseDate.toISOString().split('T')[0]) {
                                updateData.releaseDate = newDate;
                                dataFound = true;
                                updatesLog.push(`Release Date (${newDate.toISOString().split('T')[0]})`);
                                console.log(`   📅 Release Date Adjusted: ${newDate.toISOString().split('T')[0]}`);
                            }
                        }

                        // Videos / Screens / TimeToBeat
                        // Only update specialized fields on refresh or if empty? Let's be aggressive if we found data.
                        if ((!game.screenshots || options.refresh || forceRefresh) && igdbData.screenshots?.length) {
                            updateData.screenshots = igdbData.screenshots.map(s => getIgdbImageUrl(s.image_id, '1080p'));
                            dataFound = true;
                            updatesLog.push("Screenshots");
                        }
                        if ((!game.videos || options.refresh || forceRefresh) && igdbData.videos?.length) {
                            updateData.videos = igdbData.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`);
                            dataFound = true;
                            updatesLog.push("Videos");
                        }

                        // Time To Beat (from IGDB)
                        try {
                            if (!game.igdbTime || options.refresh) {
                                const timeData = await getIgdbTimeToBeat(igdbData.id);
                                if (timeData) {
                                    updateData.igdbTime = {
                                        hastly: timeData.hastly,
                                        normally: timeData.normally,
                                        completely: timeData.completely
                                    };
                                    dataFound = true;
                                    updatesLog.push("IGDB Time");
                                }
                            }
                        } catch (e) { /* ignore */ }

                        if ((!game.storyline || options.refresh || forceRefresh) && igdbData.storyline) {
                            updateData.storyline = igdbData.storyline; dataFound = true; updatesLog.push("Storyline");
                        }
                        if ((game.status === undefined || game.status === null || options.refresh || forceRefresh) && igdbData.status !== undefined) {
                            updateData.status = igdbData.status; dataFound = true; updatesLog.push(`Status (${igdbData.status})`);
                        }
                        if ((game.gameType === undefined || game.gameType === null || options.refresh || forceRefresh) && igdbData.game_type !== undefined) {
                            updateData.gameType = igdbData.game_type; dataFound = true; updatesLog.push(`Game Type (${igdbData.game_type})`);
                        }

                        // Consolidated Related Games JSON
                        if (!game.relatedGames || options.refresh || forceRefresh) {
                            const relatedGames: any = {};
                            if (igdbData.dlcs?.length) relatedGames.dlcs = igdbData.dlcs;
                            if (igdbData.expansions?.length) relatedGames.expansions = igdbData.expansions;
                            if (igdbData.remakes?.length) relatedGames.remakes = igdbData.remakes;
                            if (igdbData.remasters?.length) relatedGames.remasters = igdbData.remasters;
                            if (igdbData.expanded_games?.length) relatedGames.expanded_games = igdbData.expanded_games; // Inverse of expansion

                            // Add Franchise Games
                            const franchiseGames = igdbData.franchises?.[0]?.games || igdbData.collection?.games;
                            if (franchiseGames?.length) {
                                relatedGames.franchise_games = franchiseGames.map(fg => ({ id: fg.id, name: fg.name }));
                            }

                            if (Object.keys(relatedGames).length > 0) {
                                updateData.relatedGames = relatedGames;
                                dataFound = true;
                                updatesLog.push("Related Games");
                            }
                        }

                        // --- NEW: Extended Metadata ---
                        // --- NEW: Extended Metadata ---
                        if ((game.hypes === undefined || game.hypes === null || options.refresh || forceRefresh) && igdbData.hypes !== undefined) {
                            updateData.hypes = igdbData.hypes;
                            dataFound = true;
                        }
                        if ((!game.summary || options.refresh || forceRefresh) && igdbData.summary) { updateData.summary = igdbData.summary; }
                        if ((!game.keywords || options.refresh || forceRefresh) && igdbData.keywords?.length) { updateData.keywords = igdbData.keywords.map(k => k.name); }
                        // Themes managed via Genres merge below

                        // Explicit Relations Columns (JSON)
                        if ((!game.dlcs || options.refresh || forceRefresh) && igdbData.dlcs?.length) { updateData.dlcs = igdbData.dlcs.map(d => ({ id: d.id, name: d.name })); }
                        if ((!game.ports || options.refresh || forceRefresh) && igdbData.ports?.length) { updateData.ports = igdbData.ports.map(p => ({ id: p.id, name: p.name })); }
                        if ((!game.remakes || options.refresh || forceRefresh) && igdbData.remakes?.length) { updateData.remakes = igdbData.remakes.map(r => ({ id: r.id, name: r.name })); }
                        if ((!game.remasters || options.refresh || forceRefresh) && igdbData.remasters?.length) { updateData.remasters = igdbData.remasters.map(r => ({ id: r.id, name: r.name })); }

                        // --- NEW: Themes & Franchise ---
                        // Merge Themes into Genres
                        let existingGenres: string[] = [];
                        try {
                            if (Array.isArray(game.genres)) existingGenres = game.genres;
                            else if (typeof game.genres === 'string') {
                                // Try JSON parse first
                                if (game.genres.trim().startsWith('[')) existingGenres = JSON.parse(game.genres);
                                else existingGenres = [game.genres]; // Single string?
                            }
                        } catch (e) { existingGenres = []; }

                        const newGenres = new Set<string>(existingGenres.map(g => normalizeGenre(g))); // Normalize existing

                        let genresAdded = 0;
                        if (igdbData.genres) {
                            igdbData.genres.forEach(g => {
                                const norm = normalizeGenre(g.name);
                                if (!newGenres.has(norm)) { newGenres.add(norm); genresAdded++; }
                            });
                        }
                        if (igdbData.themes) {
                            igdbData.themes.forEach(t => {
                                const norm = normalizeGenre(t.name);
                                if (!newGenres.has(norm)) { newGenres.add(norm); genresAdded++; }
                            });
                        }
                        if (newGenres.size > existingGenres.length) {
                            updateData.genres = Array.from(newGenres);
                            dataFound = true;
                            updatesLog.push(`Genres (+${genresAdded})`);
                        }

                        // Studio / Developer
                        if ((!game.studio || options.refresh || forceRefresh) && igdbData.involved_companies) {
                            const developers = igdbData.involved_companies
                                .filter(c => c.developer)
                                .map(c => c.company.name);

                            if (developers.length > 0) {
                                // Join multiple developers with comma if needed, or just take first
                                updateData.studio = developers.join(', ');
                                dataFound = true;
                                updatesLog.push(`Studio (${updateData.studio})`);
                            }
                        }

                        // Franchise / Series / Collection
                        if (!game.franchise || options.refresh || forceRefresh) {
                            let franchiseName: string | null = null;
                            if (igdbData.collection) franchiseName = igdbData.collection.name;
                            else if (igdbData.franchises && igdbData.franchises.length > 0) franchiseName = igdbData.franchises[0].name;

                            if (franchiseName) {
                                updateData.franchise = franchiseName;
                                dataFound = true;
                                updatesLog.push(`Franchise: ${franchiseName}`);
                            }
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
                            updatesLog.push("Marked as DLC");
                            // Try to find parent if sent
                            if (igdbData.parent_game) {
                                let parent = null;
                                if (!options.csv) {
                                    parent = await prisma.game.findFirst({
                                        where: { title: igdbData.parent_game.name },
                                        select: { id: true }
                                    });
                                }
                                if (parent) {
                                    // Double check we aren't linking to ourselves (via DB ID) just in case
                                    if (parent.id !== game.id) {
                                        updateData.parentId = parent.id;
                                        updatesLog.push(`Parent ID (${parent.id})`);
                                        console.log(`   🔗 Linked to Parent: ${igdbData.parent_game.name}`);
                                    }
                                }
                            }
                        }
                    }

                    // Fallback: If we have no background yet, use a screenshot from IGDB
                    if (igdbData && igdbData.screenshots && igdbData.screenshots.length > 0) {
                        const hasBg = updateData.backgroundImage || game.backgroundImage;
                        if (!hasBg) {
                            updateData.backgroundImage = getIgdbImageUrl(igdbData.screenshots[0].image_id, '1080p');
                            dataFound = true;
                            updatesLog.push("Background (Fallback IGDB Screen)");
                        }
                    }
                } catch (e) {
                    console.error(`   ⚠️ Error in Art/Metadata enrichment:`, e);
                }
            }

            // --- A2. RAWG ENRICHMENT (New) ---
            if (useRawg && !skipRawg) {
                try {
                    // Search RAWG if we want extra genres or didn't find them
                    const rawgResults = await searchRawgGames(game.title, 5);
                    rawgRequestMade = true;

                    if (rawgResults.length > 0) {
                        let candidate: RawgGame | null = null;
                        for (const res of rawgResults) {
                            const cYear = res.released ? new Date(res.released).getFullYear() : null;
                            const match = isMatch(game.title, res.name, game.releaseDate, cYear);
                            if (match) {
                                candidate = res;
                                break;
                            }
                        }

                        if (candidate) {
                            // Merge Genres
                            const existingGenres = new Set<string>((game.genres || []) as string[]);
                            // Merge local updates from IGDB if any
                            if (updateData.genres) (updateData.genres as string[]).forEach(g => existingGenres.add(g));

                            // Normalize all current
                            const normalizedGenres = new Set<string>();
                            const safeGenres = Array.isArray(game.genres) ? game.genres : (game.genres ? [String(game.genres)] : []);
                            safeGenres.forEach((g: any) => normalizedGenres.add(normalizeGenre(String(g))));

                            // Add existingGenres (which gathered updates) too
                            existingGenres.forEach(g => normalizedGenres.add(normalizeGenre(g)));

                            let added = 0;
                            if (candidate.genres) {
                                candidate.genres.forEach(g => {
                                    const norm = normalizeGenre(g.name);
                                    if (!normalizedGenres.has(norm)) {
                                        normalizedGenres.add(norm);
                                        added++;
                                    }
                                });
                            }

                            if (added > 0) {
                                updateData.genres = Array.from(normalizedGenres);
                                dataFound = true;
                                updatesLog.push(`RAWG Genres (+${added})`);
                            }

                            // Background Image Preference
                            if (candidate.background_image) {
                                // Always overwrite or only if better? User said "from rawg since they are better".
                                // Let's overwrite.
                                updateData.backgroundImage = candidate.background_image;
                                dataFound = true;
                                updatesLog.push("Background (RAWG)");
                            }
                        }
                    }
                } catch (e: any) {
                    if (e.message && (e.message.includes('429') || e.message.includes('401'))) {
                        console.warn(`   🛑 RAWG Error (${e.message}). Disabling RAWG for the rest of this run.`);
                        skipRawg = true;
                    } else {
                        console.error(`   ⚠️ RAWG Error:`, e.message || e);
                    }
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
                            updatesLog.push(`Steam ID (${steamId})`);
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
                                updatesLog.push(`Steam Reviews (${stats.scoreDesc})`);
                                console.log(`   🚂 Reviews: ${stats.scoreDesc} (${stats.percentPositive}%)`);
                            }
                        }

                        if (foundNewId) {
                            // Check collision
                            let exists = null;
                            if (!options.csv) exists = await prisma.game.findUnique({ where: { steamAppId: String(steamId) } });

                            if (!exists || exists.id === game.id) {
                                updateData.steamAppId = String(steamId);
                                dataFound = true;
                                // Log already added for new Steam ID
                            }
                        }

                    } catch (e) { console.error(`   ⚠️ Error fetching Steam stats:`, e); }
                }
            }

            // --- B2. OPENCRITIC ENRICHMENT ---
            if (options.opencritic && !skipOpenCritic) {
                // Only fetch if missing or refresh
                if (game.opencriticScore === null || options.refresh) {
                    try {
                        const { getOpenCriticScore } = require('../lib/opencritic'); // Lazy load
                        const ocData = await getOpenCriticScore(game.title);

                        if (ocData && ocData.score !== null) {
                            updateData.opencriticScore = ocData.score;
                            if (ocData.url && !game.opencriticUrl) {
                                updateData.opencriticUrl = ocData.url;
                                updatesLog.push("OpenCritic URL");
                            }
                            dataFound = true;
                            updatesLog.push(`OpenCritic Score (${ocData.score})`);
                            console.log(`   🏆 OpenCritic: ${ocData.score}`);
                        }
                    } catch (e: any) {
                        if (e.message && e.message.includes('429')) {
                            console.warn(`   🛑 OpenCritic Rate Limit hit. Disabling OpenCritic for rest of run.`);
                            skipOpenCritic = true;
                        } else {
                            console.error(`   ⚠️ Error fetching OpenCritic:`, e.message || e);
                        }
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
                                updatesLog.push("HLTB URL");
                            }

                            // URL is not returned by current scraper, but we could infer or update lib/hltb to return it
                            // For now we just save times
                            dataFound = true;
                            updatesLog.push(`HLTB Times (Main ${Math.round(hltbResult.main / 60)}h)`);
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

                if (updatesLog.length > 0) {
                    console.log(`   📝 Updated: ${updatesLog.join(', ')}`);
                } else {
                    console.log(`   ⏺️ No new data found.`);
                }
            } else if (Object.keys(updateData).length > 0) {
                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        ...updateData,
                        dataFetched: true,
                        updatedAt: new Date() // Always update timestamp
                    }
                });
                console.log(`   💾 Updated: ${updatesLog.join(', ')}`);
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
            if (useRawg && rawgRequestMade) {
                delay = Math.max(delay, 2000); // RAWG needs ~1-2s spacing usually
            }

            processed++;
            await new Promise(r => setTimeout(r, delay));

        } catch (err) {
            console.error(`❌ CRITICAL ERROR processing ${game.title}:`, err);
            // Continue loop
            processed++; // Still count as processed to avoid infinite loop on error
        }
    }

    console.log(`\n🏁 Finished. Updated ${updated} of ${processed} games.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
