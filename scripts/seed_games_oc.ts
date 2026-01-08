
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();
const CSV_PATH = path.join(process.cwd(), 'scripts', 'csv', 'opencritic_sync-score.csv');

async function main() {
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`CSV file not found at ${CSV_PATH}`);
        process.exit(1);
    }

    console.log(`Reading CSV from ${CSV_PATH}...`);
    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '|',
        relax_column_count: true
    });

    console.log(`Found ${records.length} records.`);

    // Deduplicate records by ID
    const uniqueRecords = new Map();
    for (const row of records) {
        if (row.id) {
            uniqueRecords.set(row.id, row);
        }
    }
    console.log(`Deduplicated to ${uniqueRecords.size} unique records.`);

    console.log('Clearing dependent UserLibrary entries...');
    await prisma.userLibrary.deleteMany({});

    console.log('Clearing dependent ActivityLog entries (if not cascade)...');
    await prisma.activityLog.deleteMany({});

    console.log('Clearing Game table...');
    await prisma.game.deleteMany({});

    console.log('Starting Seed...');

    let processed = 0;
    let errors = 0;

    const hoursToMinutes = (val: string | undefined): number | null => {
        if (!val || val === '' || val === 'null') return null;
        const num = parseFloat(val);
        if (isNaN(num)) return null;
        return Math.round(num * 60);
    };

    const parseIntSafe = (v: string | undefined): number | null => (v && v !== 'null' && v !== '') ? parseInt(v, 10) : null;
    const parseBoolean = (v: string | undefined): boolean => v === 'true';
    const parseDate = (v: string | undefined): Date | null => (v && v !== 'null' && v !== '') ? new Date(v) : null;

    const parseJson = (v: string | undefined): any => {
        if (!v || v === 'null' || v === '') return null;
        try {
            return JSON.parse(v);
        } catch (e) {
            return null;
        }
    }

    const parseArray = (v: string | undefined): string[] => {
        if (!v || v === 'null' || v === '') return [];
        try {
            const parsed = JSON.parse(v);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    // Convert Map back to array for iteration
    const finalRecords = Array.from(uniqueRecords.values());

    for (const row of finalRecords) {
        try {
            if (!row.id || !row.title) continue;

            const data: any = {
                id: row.id,
                title: row.title,
                coverImage: row.coverImage || null,
                backgroundImage: row.backgroundImage || null,
                releaseDate: parseDate(row.releaseDate),
                description: row.description || null,

                // Media
                screenshots: parseArray(row.screenshots),
                videos: parseArray(row.videos),

                // External Links
                steamUrl: row.steamUrl || null,
                opencriticUrl: row.opencriticUrl || null,
                igdbUrl: row.igdbUrl || null,
                hltbUrl: row.hltbUrl || null,

                // Scores
                opencriticScore: parseIntSafe(row.opencriticScore),
                igdbScore: parseIntSafe(row.igdbScore),

                // Steam Specific
                steamAppId: row.steamAppId || null,
                steamReviewScore: row.steamReviewScore || null,
                steamReviewCount: parseIntSafe(row.steamReviewCount),
                steamReviewPercent: parseIntSafe(row.steamReviewPercent),
                isDlc: parseBoolean(row.isDlc),

                igdbId: row.igdbId || null,
                studio: row.studio || null,
                genres: row.genres || null,
                platforms: parseJson(row.platforms),

                // Playtime Data
                igdbTime: parseJson(row.igdbTime),

                // New Metadata (IGDB)
                storyline: row.storyline || null,
                status: parseIntSafe(row.status),
                gameType: parseIntSafe(row.gameType),
                relatedGames: parseJson(row.relatedGames),

                dataFetched: parseBoolean(row.dataFetched) || true,
                dataMissing: parseBoolean(row.dataMissing) || false,

                hltbMain: hoursToMinutes(row.hltbMain),
                hltbExtra: hoursToMinutes(row.hltbExtra),
                hltbCompletionist: hoursToMinutes(row.hltbCompletionist),
                hltbUrl: row.hltbUrl || null,

                // Extended Metadata
                franchise: row.franchise || null,
                hypes: parseIntSafe(row.hypes),
                summary: row.summary || null,
                keywords: parseArray(row.keywords),
                themes: parseArray(row.themes),

                ports: parseJson(row.ports),
                remakes: parseJson(row.remakes),
                remasters: parseJson(row.remasters),
            };

            if (row.parentId && row.parentId !== 'null' && row.parentId !== '') {
                // We will link parents in the second pass to avoid FK errors
                // data.parentId = row.parentId;
            }

            await prisma.game.create({
                data: data
            });

            processed++;
            if (processed % 100 === 0) process.stdout.write(`\rInserted: ${processed}`);

        } catch (e) {
            console.error(`\nError inserting ${row.title}:`, e);
            errors++;
        }
    }

    // Pass 2: Link Parents
    console.log('\nLinking Parents...');
    let linked = 0;
    for (const row of finalRecords) {
        if (row.parentId && row.parentId !== 'null' && row.parentId !== '') {
            try {
                await prisma.game.update({
                    where: { id: row.id },
                    data: { parentId: row.parentId }
                });
                linked++;
                if (linked % 100 === 0) process.stdout.write(`\rLinked: ${linked}`);
            } catch (e) {
                // ignore
            }
        }
    }

    console.log(`\nSeed Complete. Inserted: ${processed}, Linked: ${linked}, Errors: ${errors}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
