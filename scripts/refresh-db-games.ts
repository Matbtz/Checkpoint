
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

const CSV_PATH = path.join(process.cwd(), 'scripts', 'csv', 'enriched_library.csv');

async function main() {
    try {
        if (!fs.existsSync(CSV_PATH)) {
            console.error(`CSV file not found at ${CSV_PATH}`);
            process.exit(1);
        }

        console.log('--- STARTING DATABASE REFRESH ---');
        console.log('WARNING: This will WIPE all UserLibrary, ActivityLog, and Game data.');

        // 1. WIPE DATA
        console.log('\nStep 1: Wiping existing data...');

        console.log('Deleting ActivityLogs...');
        await prisma.activityLog.deleteMany({});

        console.log('Deleting UserLibrary entries...');
        await prisma.userLibrary.deleteMany({});

        console.log('Unlinking DLCs (clearing parentId)...');
        // Necessary to avoid self-referential foreign key constraint errors during delete
        await prisma.game.updateMany({
            where: { parentId: { not: null } },
            data: { parentId: null }
        });

        console.log('Deleting Games...');
        await prisma.game.deleteMany({});

        console.log('Clean slate achieved.');

        // 2. READ CSV
        console.log(`\nStep 2: Reading CSV from ${CSV_PATH}...`);
        const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            delimiter: '|', // Verified delimiter from previous check
            relax_column_count: true,
        });

        console.log(`Found ${records.length} records to import.`);

        // 3. IMPORT GAMES (Pass 1)
        console.log('\nStep 3: Importing Games (Pass 1 - Creation)...');
        let processed = 0;
        let errors = 0;

        for (const row of records) {
            try {
                if (!row.id || !row.title) {
                    console.warn('Skipping invalid row (missing id or title):', row);
                    continue;
                }

                // Parsers
                const parseIntSafe = (v: any) => (v && v !== 'null' && v !== '' && !isNaN(Number(v))) ? Math.round(Number(v)) : null;
                const parseFloatSafe = (v: any) => (v && v !== 'null' && v !== '' && !isNaN(Number(v))) ? Number(v) : null;
                const parseJsonSafe = (v: any, defaultVal: any = null) => {
                    if (!v || v === 'null' || v === '') return defaultVal;
                    try {
                        // Sometimes CSV export might double-encode or leave unescaped quotes? 
                        // Assuming standard JSON string here.
                        return JSON.parse(v);
                    } catch (e) {
                        return defaultVal;
                    }
                };
                const parseDateSafe = (v: any) => {
                    if (!v || v === 'null' || v === '') return null;
                    const d = new Date(v);
                    return isNaN(d.getTime()) ? null : d;
                };
                const parseBoolSafe = (v: any) => v === 'true' || v === true;

                // Field Mapping
                const data = {
                    id: row.id,
                    title: row.title,
                    coverImage: row.coverImage || null,
                    backgroundImage: row.backgroundImage || null,
                    releaseDate: parseDateSafe(row.releaseDate),
                    description: row.description || null,

                    // Media
                    screenshots: parseJsonSafe(row.screenshots, []),
                    videos: parseJsonSafe(row.videos, []),

                    // Links
                    steamUrl: row.steamUrl || null,
                    opencriticUrl: row.opencriticUrl || null,
                    igdbUrl: row.igdbUrl || null,
                    hltbUrl: row.hltbUrl || null,

                    // Scores
                    opencriticScore: parseIntSafe(row.opencriticScore),
                    igdbScore: parseIntSafe(row.igdbScore),

                    // Steam
                    steamAppId: row.steamAppId || null,
                    steamReviewScore: row.steamReviewScore || null,
                    steamReviewCount: parseIntSafe(row.steamReviewCount),
                    steamReviewPercent: parseIntSafe(row.steamReviewPercent),

                    // Metadata
                    isDlc: parseBoolSafe(row.isDlc),
                    igdbId: row.igdbId || null,
                    studio: row.studio || null,
                    genres: row.genres || null, // Keeping as string if it's "Action, RPG" or JSON string? Schema says String? (JSON string)
                    platforms: parseJsonSafe(row.platforms, null),

                    // Extra Meta
                    storyline: row.storyline || null,
                    status: parseIntSafe(row.status),
                    gameType: parseIntSafe(row.gameType),
                    franchise: row.franchise || null,
                    hypes: parseIntSafe(row.hypes),
                    summary: row.summary || null,

                    // Arrays
                    keywords: parseJsonSafe(row.keywords, []),
                    themes: parseJsonSafe(row.themes, []),

                    // Relations (JSON lists)
                    ports: parseJsonSafe(row.ports, null),
                    remakes: parseJsonSafe(row.remakes, null),
                    remasters: parseJsonSafe(row.remasters, null),
                    relatedGames: parseJsonSafe(row.relatedGames, null),

                    // Times
                    hltbMain: parseIntSafe(row.hltbMain),
                    hltbExtra: parseIntSafe(row.hltbExtra),
                    hltbCompletionist: parseIntSafe(row.hltbCompletionist),
                    igdbTime: parseJsonSafe(row.igdbTime, null),

                    // Status
                    dataMissing: parseBoolSafe(row.dataMissing),
                    dataFetched: parseBoolSafe(row.dataFetched),
                    imageStatus: "OK", // Default

                    // ParentId - Skip in Pass 1
                    parentId: null
                };

                await prisma.game.create({
                    data: data
                });

                processed++;
                if (processed % 100 === 0) process.stdout.write(`\rImported: ${processed}`);

            } catch (e) {
                console.error(`\nError importing ${row.title} (${row.id}):`, e);
                errors++;
            }
        }

        console.log(`\nPass 1 Complete. Imported: ${processed}, Errors: ${errors}`);

        // 4. LINK PARENTS (Pass 2)
        console.log('\nStep 4: Linking DLCs (Pass 2)...');
        let linked = 0;

        for (const row of records) {
            if (row.parentId && row.parentId !== 'null' && row.parentId.trim() !== '') {
                try {
                    // Check if parent exists first to avoid error? Or just try update.
                    // Upsert/Create guarantees the ID exists if it was in the file.
                    // But parent might not be in the file.

                    await prisma.game.update({
                        where: { id: row.id },
                        data: { parentId: row.parentId }
                    });
                    linked++;
                } catch (e) {
                    // Silent fail if parent doesn't exist in DB (orphan DLC)
                    // console.warn(`Parent ${row.parentId} not found for ${row.title}`);
                }
            }
        }

        console.log(`Pass 2 Complete. Linked ${linked} items to their parents.`);
        console.log('\n--- REFRESH COMPLETE ---');

    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
