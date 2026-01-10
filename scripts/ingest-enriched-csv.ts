
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

const CSV_PATH = path.join(process.cwd(), 'scripts', 'csv', 'database_enriched_clean.csv');

async function main() {
    if (!fs.existsSync(CSV_PATH)) {
        console.error(`CSV file not found at ${CSV_PATH}`);
        process.exit(1);
    }

    console.log(`Reading CSV from ${CSV_PATH}...`);
    const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        delimiter: '|',
        relax_column_count: true, // Handle potential inconsistent rows safely
    }) as any[]; // Using any[] for simplicity as CSV columns can be dynamic, or properly interface it.

    // Better to define interface if possible, but 'any' fixes the build error quickly given the script nature.
    // Or we can define a Loose Record
    interface CsvRecord {
        id: string;
        title: string;
        releaseDate?: string;
        genres?: string;
        screenshots?: string;
        videos?: string;
        keywords?: string;
        themes?: string;
        platforms?: string;
        remakes?: string;
        remasters?: string;
        ports?: string;
        relatedGames?: string;
        igdbTime?: string;
        isDlc?: string;
        dataFetched?: string;
        dataMissing?: string;
        coverImage?: string;
        backgroundImage?: string;
        description?: string;
        steamUrl?: string;
        opencriticUrl?: string;
        igdbUrl?: string;
        hltbUrl?: string;
        opencriticScore?: string;
        igdbScore?: string;
        steamAppId?: string;
        steamReviewScore?: string;
        opencriticScoreUpdatedAt?: string;
        steamReviewCount?: string;
        steamReviewPercent?: string;
        igdbId?: string;
        studio?: string;
        storyline?: string;
        status?: string;
        gameType?: string;
        hltbMain?: string;
        hltbExtra?: string;
        hltbCompletionist?: string;
        franchise?: string;
        hypes?: string;
        parentId?: string;
        [key: string]: any;
    }

    console.log(`Found ${records.length} records. Starting Pass 1: Upsert Games...`);

    let processed = 0;
    let errors = 0;

    // PASS 1: Create/Update Games (ignoring relations)
    for (const row of (records as CsvRecord[])) {
        try {
            if (!row.id || !row.title) {
                console.warn('Skipping INVALID_ROW: Minimal data missing', row);
                continue;
            }

            // -- Data Mapping --

            // Dates
            const cleanString = (str: string | undefined) => {
                if (!str) return null;
                return str.replace(/^["']+|["']+$/g, '');
            };

            const rawDateStr = cleanString(row.releaseDate);
            const rawReleaseDate = rawDateStr ? new Date(rawDateStr) : null;
            const validReleaseDate = (rawReleaseDate && !isNaN(rawReleaseDate.getTime())) ? rawReleaseDate : null;

            // Numbers
            const parseIntSafe = (v: string | undefined): number | null => (v && v !== 'null' && v !== '') ? parseInt(v, 10) : null;
            const parseFloatSafe = (v: string | undefined): number | null => (v && v !== 'null' && v !== '') ? parseFloat(v) : null;

            // JSON Fields which are definitely arrays/objects in Prisma (Json or String[])
            const parseJsonSafe = (v: string | undefined, defaultVal: any = null) => {
                if (!v || v === 'null' || v === '') return defaultVal;
                try {
                    return JSON.parse(v);
                } catch (e) {
                    return defaultVal;
                }
            };

            // Strings (JSON stringified in DB)
            const genres = (row.genres && row.genres !== 'null') ? row.genres : null;

            // Arrays (String[] in schema) -> Need actual Array object
            const screenshots = parseJsonSafe(row.screenshots, []);
            const videos = parseJsonSafe(row.videos, []);
            const keywords = parseJsonSafe(row.keywords, []);
            // const themes = parseJsonSafe(row.themes, []); // Removed

            // Json Objects (Json in schema) -> Need actual Object/Array
            const platforms = parseJsonSafe(row.platforms, null);
            const remakes = parseJsonSafe(row.remakes, null);
            const remasters = parseJsonSafe(row.remasters, null);
            const ports = parseJsonSafe(row.ports, null);
            const relatedGames = parseJsonSafe(row.relatedGames, null);
            const igdbTime = parseJsonSafe(row.igdbTime, null);

            // Booleans
            const isDlc = row.isDlc === 'true';
            // const dataFetched = row.dataFetched === 'true'; // Removed
            // const dataMissing = row.dataMissing === 'true'; // Removed

            const data = {
                title: row.title,
                coverImage: row.coverImage || null,
                backgroundImage: row.backgroundImage || null,
                releaseDate: validReleaseDate,
                description: row.description || null,

                steamUrl: row.steamUrl || null,
                opencriticUrl: row.opencriticUrl || null,
                opencriticScoreUpdatedAt: (row.opencriticScoreUpdatedAt && cleanString(row.opencriticScoreUpdatedAt)) ? new Date(cleanString(row.opencriticScoreUpdatedAt)!) : ((row.opencriticScore && row.opencriticScore !== 'null') ? validReleaseDate : null),
                igdbUrl: row.igdbUrl || null,
                hltbUrl: row.hltbUrl || null,

                opencriticScore: parseIntSafe(row.opencriticScore),
                igdbScore: parseIntSafe(row.igdbScore),

                steamAppId: row.steamAppId || null,
                steamReviewScore: row.steamReviewScore || null,
                steamReviewCount: parseIntSafe(row.steamReviewCount),
                steamReviewPercent: parseIntSafe(row.steamReviewPercent),

                isDlc: isDlc,
                igdbId: row.igdbId || null,
                studio: row.studio || null,

                genres: genres,
                platforms: platforms,

                screenshots: screenshots,
                videos: videos,

                igdbTime: igdbTime,

                storyline: row.storyline || null,
                status: parseIntSafe(row.status),
                gameType: parseIntSafe(row.gameType),

                relatedGames: relatedGames,

                // dataMissing: dataMissing, // Removed
                // dataFetched: dataFetched, // Removed

                hltbMain: parseIntSafe(row.hltbMain),
                hltbExtra: parseIntSafe(row.hltbExtra),
                hltbCompletionist: parseIntSafe(row.hltbCompletionist),

                franchise: row.franchise || null,
                hypes: parseIntSafe(row.hypes),

                keywords: keywords,
                // themes: themes, // Removed

                ports: ports,
                remakes: remakes,
                remasters: remasters,

                // Always explicit null for parentId in Pass 1 to avoid FK errors
                // parentId: null 
            };

            await prisma.game.upsert({
                where: { id: row.id },
                update: data,
                create: {
                    id: row.id,
                    ...data
                }
            });

            processed++;
            if (processed % 100 === 0) process.stdout.write(`\rProcessed: ${processed}`);

        } catch (e: any) {
            // Log concise error to avoid flooding (Prisma errors can be huge)
            const msg = e.code ? `${e.code}: ${e.message.split('\n').pop()}` : e.message;
            console.error(`\n❌ Error processing ${row.title} (${row.id}): ${msg}`);
            errors++;
        }
    }

    console.log(`\nPass 1 Complete. Processed: ${processed}, Errors: ${errors}`);

    // PASS 2: Link Parent IDs
    console.log('Starting Pass 2: Linking Parent IDs...');
    let linked = 0;

    for (const row of records) {
        if (row.parentId && row.parentId !== 'null' && row.parentId.trim() !== '') {
            try {
                await prisma.game.update({
                    where: { id: row.id },
                    data: {
                        parentId: row.parentId
                    }
                });
                linked++;
            } catch (e) {
                // Expected if parent doesn't exist (e.g. parent wasn't in CSV and not in DB)
                // console.warn(`Could not link parent ${row.parentId} for ${row.id}`);
                errors++; // Count linking errors? No, variable 'errors' isn't in scope here cleanly or reuse?
                // Reuse 'errors' if I move declaration up?
                // Just log:
                // console.warn(`⚠️ Parent ${row.parentId} not found for ${row.title || row.id}`);
            }
        }
    }

    console.log(`\nPass 2 Complete. Linked ${linked} DLCs/Expansions.`);
    console.log('Done.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
