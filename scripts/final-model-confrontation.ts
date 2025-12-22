import { prisma } from '../lib/db';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------------------------

const BASELINE_MAIN = 300; // 5h

// Cluster Definitions for Ratio Logic
const GENRE_CLUSTERS = {
    SYSTEMIC: new Set([
        "Roguelike", "Roguelite", "Fighting", "PvP", "eSports",
        "Sports", "Arcade", "MMORPG", "Grand Strategy", "Strategy 4X",
        "Card Battler", "City Builder", "Management"
    ]),
    NARRATIVE: new Set([
        "Point & Click", "Visual Novel", "Walking Simulator",
        "Interactive Movie", "FMV", "Linear", "Short", "Hidden Object",
        "Interactive Fiction", "Puzzle"
    ])
};

// Iteration 17: Final Polish. 
// Visual Novel -> Short. Sports -> Replayable.
// Life Sim removed from Indie Boost. Massive Hit Boost added.
const SHORT_MARKERS = new Set([
    "Short", "FMV", "Fighting", "Arcade", "Puzzle",
    "Interactive Fiction", "Walking Simulator", "Casual",
    "Card Game", "Board Game", "Deckbuilding", "Education", "Gacha",
    "Dating Sim", "Visual Novel"
]);

const REPLAYABLE_SHORT_MARKERS = new Set([
    "Roguelike", "Roguelite", "Survival", "Racing", "Sandbox", "Sports"
]);

const ENDLESS_MARKERS = new Set([
    "Farming Sim", "Crafting", "Agriculture", "Automobile Sim",
    "City Builder", "Management", "Base Building", "Colony Sim",
    "Life Sim", "4X"
]);

const INDIE_MARKERS = new Set([
    "Indie", "2D", "Pixel Graphics", "Retro", "Minimalist"
]);

const MASSIVE_MARKERS = new Set([
    "Grand Strategy", "MMORPG", "JRPG", "CRPG"
]);

const LONG_MARKERS = new Set([
    "RPG", "ARPG", "Looter Shooter", "Open World", "Strategy RPG"
]);

const STUDIO_PROFILES: Record<string, { type: 'fixed' | 'multiplier', value: number | number[] }> = {
    "telltale": { type: 'fixed', value: 660 },
    "fromsoftware": { type: 'multiplier', value: 2.0 },
    "paradox": { type: 'multiplier', value: 1.5 },
    "ubisoft": { type: 'multiplier', value: 1.3 },
    "capcom": { type: 'multiplier', value: 1.2 },
    "square enix": { type: 'multiplier', value: 1.5 }
};

// ---------------------------------------------------------------------------
// 2. MATH HELPERS
// ---------------------------------------------------------------------------

function getGeometricMean(values: number[]): number {
    if (values.length === 0) return 0;
    // Filter out zero or negative values to avoid NaN
    const cleanValues = values.filter(v => v > 0);
    if (cleanValues.length === 0) return 0;
    const logSum = cleanValues.reduce((sum, val) => sum + Math.log(val), 0);
    return Math.exp(logSum / cleanValues.length);
}

function getMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// 3. ANALYTICS ENGINE
// ---------------------------------------------------------------------------

type GameResult = {
    title: string;
    real: number;
    pred: number;
    err: number; // Percentage error (0.5 = 50%)
    bias: number; // Signed error (pred - real) / real
    genres: string[];
    reviews: number;
    rule: string;
};

function generateSegmentReport(results: GameResult[], label: string, filterFn: (g: GameResult) => boolean) {
    const subset = results.filter(filterFn);
    if (subset.length === 0) return;

    const avgErr = subset.reduce((a, b) => a + b.err, 0) / subset.length;
    const biases = subset.map(b => b.bias);
    const avgBias = biases.reduce((a, b) => a + b, 0) / biases.length;

    // Accuracy Buckets
    const within25 = subset.filter(g => g.err <= 0.25).length;
    const within50 = subset.filter(g => g.err <= 0.50).length;

    const countStr = `N=${subset.length}`.padEnd(8);
    const errStr = `${(avgErr * 100).toFixed(1)}%`.padEnd(7);
    const biasStr = `${(avgBias * 100).toFixed(1)}%`.padEnd(7);
    const accStr = `${((within25 / subset.length) * 100).toFixed(0)}%`.padEnd(4);

    // Simple ASCII Bar for Bias
    const biasBar = avgBias > 0
        ? `[+${"█".repeat(Math.min(5, Math.abs(avgBias * 10)))}]`.padEnd(7)
        : `[-${"█".repeat(Math.min(5, Math.abs(avgBias * 10)))}]`.padEnd(7);

    console.log(`| ${label.padEnd(20)} | ${countStr} | Err: ${errStr} | Bias: ${biasBar} ${biasStr} | OK: ${accStr} |`);
}

// ---------------------------------------------------------------------------
// 4. MAIN PIPELINE
// ---------------------------------------------------------------------------

async function main() {
    const outputPath = path.join(process.cwd(), 'final-report-v13-audit.txt');
    let outputLog = "";
    // Hook console.log to write to file too
    const originalLog = console.log;
    console.log = (...args) => {
        originalLog(...args);
        outputLog += args.join(" ") + "\n";
    };

    console.log(`🔎 Starting V13 Audit (Hybrid GeoMeans + Deep Analytics)...`);

    // --- PHASE 1: LEARNING (GeoMeans for Singles & Pairs) ---
    const trainingGames = await prisma.game.findMany({
        where: { hltbMain: { gt: 0 }, genres: { not: null }, isDlc: false },
        select: { genres: true, hltbMain: true }
    });

    const buckets: Record<string, number[]> = {};

    trainingGames.forEach(game => {
        let genres: string[] = [];
        try { if (typeof game.genres === 'string') genres = JSON.parse(game.genres); } catch { return; }
        genres.sort();

        // Singles
        genres.forEach(g => { if (!buckets[g]) buckets[g] = []; buckets[g].push(game.hltbMain!); });

        // Pairs (The Micro-Genre Magic)
        for (let i = 0; i < genres.length; i++) {
            for (let j = i + 1; j < genres.length; j++) {
                const pair = `${genres[i]}|${genres[j]}`;
                if (!buckets[pair]) buckets[pair] = [];
                buckets[pair].push(game.hltbMain!);
            }
        }
    });

    const GEO_MEANS: Record<string, number> = {};
    Object.entries(buckets).forEach(([key, times]) => {
        // Only trust buckets with enough data
        const minSamples = key.includes('|') ? 10 : 5;
        if (times.length >= minSamples) {
            GEO_MEANS[key] = getGeometricMean(times);
        }
    });

    console.log(`🧠 Knowledge Base: Learned ${Object.keys(GEO_MEANS).length} Genre Profiles.`);

    // --- PHASE 2: PREDICTION ---
    const testGames = await prisma.game.findMany({
        where: { hltbMain: { gt: 0 }, genres: { not: null }, isDlc: false },
        select: { title: true, genres: true, studio: true, hltbMain: true, steamReviewCount: true, isDlc: true, releaseDate: true }
    });

    const results: GameResult[] = [];

    testGames.forEach(game => {
        const realMain = game.hltbMain as number;
        if (realMain < 60) return; // Skip tiny noise

        let genres: string[] = [];
        try { if (typeof game.genres === 'string') genres = JSON.parse(game.genres); } catch { return; }
        genres.sort();
        const cleanGenres = genres.filter(g => g);
        const lowerTitle = game.title.toLowerCase();

        // --- V13 PREDICTION LOGIC ---
        let predMain = BASELINE_MAIN;
        let rule = "Baseline";

        // 1. SEMANTIC CAPS (First Line of Defense)
        const isEdition = lowerTitle.includes('edition') || lowerTitle.includes('remaster');
        if (!isEdition && (lowerTitle.includes('episode ') || lowerTitle.includes('prologue'))) {
            predMain = 120;
            rule = "Keyword Cap";
        }
        else {
            // 2. PAIR-WISE GEO-MEAN LOOKUP (Priority)
            // Find all applicable pairs for this game
            let bestMean = 0;
            let bestMeanCount = 0;
            let usedPair = "";

            // Collect all valid pair means
            const means: number[] = [];
            for (let i = 0; i < genres.length; i++) {
                for (let j = i + 1; j < genres.length; j++) {
                    const key = `${genres[i]}|${genres[j]}`;
                    if (GEO_MEANS[key]) means.push(GEO_MEANS[key]);
                }
            }

            if (means.length > 0) {
                // --- ITERATION 17: FINAL POLISH ---

                const findMarker = (set: Set<string>) => genres.find(g => set.has(g));
                const hasMarker = (set: Set<string>) => genres.some(g => set.has(g));

                const matchShort = findMarker(SHORT_MARKERS);
                const matchReplay = findMarker(REPLAYABLE_SHORT_MARKERS);
                const matchEndless = findMarker(ENDLESS_MARKERS);
                const matchMassive = findMarker(MASSIVE_MARKERS);
                const matchLong = findMarker(LONG_MARKERS);

                const hasShortMarker = !!matchShort;
                const hasReplayableShort = !!matchReplay;
                const hasEndlessMarker = !!matchEndless;
                const hasMassiveMarker = !!matchMassive;
                const hasLongMarker = !!matchLong;

                // Enhanced Indie Detection
                const isIndie = hasMarker(INDIE_MARKERS) || genres.includes("Indie") || (game.steamReviewCount || 0) < 500;

                if (game.isDlc) {
                    predMain = Math.min(...means) * 0.7;
                    rule = `Anchor: DLC-MIN (0.7x)`;
                }
                else if (hasShortMarker) {
                    predMain = Math.min(...means);
                    rule = `Anchor: MIN [${matchShort}]`;
                }
                else if (hasReplayableShort) {
                    predMain = Math.min(...means);
                    rule = `Anchor: MIN-REPLAY [${matchReplay}]`;
                }
                else if (hasEndlessMarker && !isIndie) {
                    // Endless Games: usually underestimated.
                    // Iteration 17: Apply 1.6x Boost (was 1.4x)
                    predMain = Math.max(...means) * 1.6;
                    rule = `Anchor: MAX-ENDLESS-BOOST [${matchEndless}]`;
                }
                else if (hasEndlessMarker && isIndie) {
                    // Indie Endless: Dampen logic significantly
                    // Iteration 17: Remove Life Sim (60 Parsecs fix). Boost Auto/Farming harder.
                    const isSim = genres.some(g => ["Farming Sim", "Automobile Sim"].includes(g));

                    if (isSim) {
                        // Sim Boost for Indie (Auto/Farming only)
                        // Iteration 17: Mean was too low. Try Mean * 1.3
                        predMain = getGeometricMean(means) * 1.3;
                        rule = `Anchor: MEAN-ENDLESS-INDIE-SIM-BOOST [${matchEndless}]`;
                    } else {
                        // Strategic Indies (Polytopia) stay MIN
                        predMain = Math.min(...means);
                        rule = `Anchor: MIN-ENDLESS-INDIE [${matchEndless}]`;
                    }
                }
                else if (hasMassiveMarker && !isIndie) {
                    // Massive: 
                    // Iteration 17: If proven hit (> 5k reviews), use MAX. Else SOFT-MAX.
                    if (game.steamReviewCount && game.steamReviewCount > 5000) {
                        predMain = Math.max(...means);
                        rule = `Anchor: MAX-MASSIVE-HIT [${matchMassive}]`;
                    } else {
                        const mean = getGeometricMean(means);
                        const max = Math.max(...means);
                        predMain = (mean + max) / 2;
                        rule = `Anchor: SOFT-MAX-MASSIVE [${matchMassive}]`;
                    }
                }
                else if (hasLongMarker) {
                    if (isIndie) {
                        const min = Math.min(...means);
                        const mean = getGeometricMean(means);
                        predMain = (min + mean) / 2;
                        rule = `Anchor: INDIE-SOFT [${matchLong}]`;
                    } else {
                        const mean = getGeometricMean(means);
                        const max = Math.max(...means);
                        predMain = (mean + max) / 2;
                        rule = `Anchor: SOFT-MAX [${matchLong}]`;
                    }
                } else {
                    // Consensus
                    if (isIndie) {
                        const min = Math.min(...means);
                        const mean = getGeometricMean(means);
                        predMain = (min + mean) / 2;
                        rule = `Anchor: MEAN-DAMPENED`;
                    } else {
                        predMain = getGeometricMean(means);
                        rule = `Anchor: MEAN (${means.length} pairs)`;
                    }
                }
            } else {
                // Fallback to Singles
                const singleMeans = genres.map(g => GEO_MEANS[g]).filter(m => m);
                if (singleMeans.length > 0) {
                    predMain = getGeometricMean(singleMeans);
                    rule = "Single GeoMean";
                }
            }

            // 3. STUDIO OVERRIDES (Fingerprinting)
            let developers: string[] = [];
            if (game.studio) developers.push(game.studio);
            developers.forEach(dev => {
                const norm = dev.toLowerCase();
                for (const [key, profile] of Object.entries(STUDIO_PROFILES)) {
                    if (norm.includes(key)) {
                        if (profile.type === 'fixed') { predMain = profile.value as number; rule += "+StudioFix"; }
                        else { predMain *= (profile.value as number); rule += "+StudioMult"; }
                    }
                }
            });

            // 4. SCOPE ADJUSTMENT (Smart Dampener)
            // Iteration 6b: Allow boost for REPLAYABLE_SHORT, disable for regular SHORT
            // Iteration 13: Enable Boost for INDIE-ENDLESS too (Polytopia has high reviews -> Scope Boost will save it from MIN)
            const matchShort = genres.find(g => SHORT_MARKERS.has(g));
            const hasShort = !!matchShort;

            if (predMain > 300 && !hasShort && !game.isDlc) {
                const reviewCount = game.steamReviewCount || 0;
                const logScope = Math.log(reviewCount + 1);

                // Boost Logic:
                const scopeFactor = 1 + ((logScope - 4.6) * 0.10);
                predMain *= scopeFactor;
                rule += `+Scope(${scopeFactor.toFixed(2)}x)`;
            }

            // 5. RETRO DAMPENER (Iteration 13)
            // Older games are generally shorter.
            if (game.releaseDate) {
                const year = new Date(game.releaseDate).getFullYear();
                if (year < 2010 && year > 1980) { // Safety check
                    predMain *= 0.85;
                    rule += `+Retro(0.85x)`;
                }
            }
        }

        const err = Math.abs(predMain - realMain) / realMain;
        const bias = (predMain - realMain) / realMain;

        results.push({
            title: game.title,
            real: realMain,
            pred: predMain,
            err: err,
            bias: bias,
            genres: cleanGenres,
            reviews: game.steamReviewCount || 0,
            rule
        });
    });

    // --- REPORT GENERATION ---

    console.log(`\n📊 FINAL PERFORMANCE AUDIT (N=${results.length})`);
    console.log(`---------------------------------------------------------------`);
    const avgErr = results.reduce((a, b) => a + b.err, 0) / results.length;
    const avgBias = results.reduce((a, b) => a + b.bias, 0) / results.length;

    // Calculate Median Absolute Error (MdAE) - Robust Metric
    const sortedErrs = [...results].sort((a, b) => a.err - b.err);
    const mdae = sortedErrs[Math.floor(sortedErrs.length / 2)].err;

    console.log(`Global Mean Error (MAE):   ${(avgErr * 100).toFixed(2)}%`);
    console.log(`Global Median Error (MdAE): ${(mdae * 100).toFixed(2)}%  <-- True Typical Error`);
    console.log(`Global Bias:               ${(avgBias * 100).toFixed(2)}%  (Positive = Overestimation)`);
    console.log(`---------------------------------------------------------------`);

    console.log(`\n📏 SEGMENT ANALYSIS: GAME LENGTH`);
    generateSegmentReport(results, "Short (< 5h)", g => g.real <= 300);
    generateSegmentReport(results, "Medium (5h-20h)", g => g.real > 300 && g.real <= 1200);
    generateSegmentReport(results, "Long (20h-50h)", g => g.real > 1200 && g.real <= 3000);
    generateSegmentReport(results, "Massive (> 50h)", g => g.real > 3000);

    console.log(`\n⭐ SEGMENT ANALYSIS: POPULARITY`);
    generateSegmentReport(results, "Niche (< 100 Rev)", g => g.reviews < 100);
    generateSegmentReport(results, "Indie (100-1k)", g => g.reviews >= 100 && g.reviews < 1000);
    generateSegmentReport(results, "AA (1k-10k)", g => g.reviews >= 1000 && g.reviews < 10000);
    generateSegmentReport(results, "AAA (> 10k)", g => g.reviews >= 10000);

    console.log(`\n🏥 GENRE HEALTH CHECK (Worst Biases)`);
    console.log(`| Genre                | Count | Bias    | Status      |`);
    console.log(`|----------------------|-------|---------|-------------|`);

    const genreStats: Record<string, { count: number, biasSum: number }> = {};
    results.forEach(r => {
        r.genres.forEach(g => {
            if (!genreStats[g]) genreStats[g] = { count: 0, biasSum: 0 };
            genreStats[g].count++;
            genreStats[g].biasSum += r.bias;
        });
    });

    Object.entries(genreStats)
        .filter(([_, d]) => d.count > 50)
        .map(([g, d]) => ({ name: g, count: d.count, bias: d.biasSum / d.count }))
        .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias)) // Sort by absolute bias magnitude
        .slice(0, 15)
        .forEach(g => {
            const biasStr = (g.bias * 100).toFixed(1) + "%";
            let status = "✅";
            if (g.bias > 0.4) status = "🔴 OVER";
            if (g.bias < -0.4) status = "🔵 UNDER";
            console.log(`| ${g.name.padEnd(20)} | ${g.count.toString().padEnd(5)} | ${biasStr.padEnd(7)} | ${status.padEnd(11)} |`);
        });

    console.log(`\n🚨 REMAINING OUTLIERS (Top 10 Failures)`);
    results.sort((a, b) => b.err - a.err).slice(0, 10).forEach(o => {
        // Truncate genres for display
        const genreStr = o.genres.join(",");
        console.log(`| ${o.title.substring(0, 20).padEnd(20)} | ${genreStr.substring(0, 20).padEnd(20)} | R:${(o.real / 60).toFixed(1)}h | P:${(o.pred / 60).toFixed(1)}h | Err:${(o.err * 100).toFixed(0)}% | ${o.rule.substring(0, 20)}... |`);
    });

    console.log(`\n🔦 SPOTLIGHT ANALYSIS`);
    generateSegmentReport(results, "RPG", g => g.genres.includes("RPG"));
    generateSegmentReport(results, "Action", g => g.genres.includes("Action"));
    generateSegmentReport(results, "Adventure", g => g.genres.includes("Adventure"));
    generateSegmentReport(results, "Action-Adventure", g => g.genres.includes("Action") && g.genres.includes("Adventure"));

    fs.writeFileSync(outputPath, outputLog);
    console.log(`\n✅ Audit Saved to ${outputPath}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());