import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const INPUT_DIR = path.join(process.cwd(), 'scripts', 'csv');

// Regex to split by | but ignore pipes inside quotes
// Logic: Match | followed by an even number of quotes until the end of the string
const SPLIT_REGEX = /\|(?=(?:(?:[^"]*"){2})*[^"]*$)/;

function unescapeCsv(field: string): string {
    if (!field) return '';
    let str = field;
    // If wrapped in quotes, remove them
    if (str.startsWith('"') && str.endsWith('"')) {
        str = str.slice(1, -1);
    }
    // Replace "" with "
    str = str.replace(/""/g, '"');
    return str;
}

function parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
}

function parseIntSafe(numStr: string): number | null {
    if (!numStr) return null;
    const n = parseInt(numStr, 10);
    return isNaN(n) ? null : n;
}

async function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`Directory ${INPUT_DIR} does not exist.`);
        process.exit(1);
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.csv'));

    if (files.length === 0) {
        console.log("No CSV files found in scripts/csv/");
        return;
    }

    console.log(`Found ${files.length} CSV files to process.`);

    for (const file of files) {
        const filePath = path.join(INPUT_DIR, file);
        console.log(`Processing ${file}...`);

        const content = fs.readFileSync(filePath, 'utf-8');
        // Note: fetch-year-games.ts replaces all newlines in fields with spaces,
        // ensuring that each line in the CSV corresponds to exactly one record.
        const lines = content.split('\n').filter(line => line.trim() !== '');

        if (lines.length < 2) {
            console.log(`File ${file} is empty or has only header.`);
            continue;
        }

        const headerLine = lines[0];
        const headers = headerLine.split(SPLIT_REGEX).map(unescapeCsv);

        // Map header name to index
        const headerMap = headers.reduce((acc, h, i) => {
            acc[h] = i;
            return acc;
        }, {} as Record<string, number>);

        // Process in chunks
        const CHUNK_SIZE = 50;
        const rows = lines.slice(1);

        let processedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        let skippedCount = 0; // Duplicates with no new data or errors

        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const chunk = rows.slice(i, i + CHUNK_SIZE);

            await Promise.all(chunk.map(async (line) => {
                try {
                    const cols = line.split(SPLIT_REGEX).map(unescapeCsv);
                    const getCol = (name: string) => {
                        const idx = headerMap[name];
                        return (idx !== undefined && idx < cols.length) ? cols[idx] : '';
                    };

                    const id = getCol('id');
                    if (!id) return; // Skip invalid rows

                    // Prepare data object from CSV
                    const csvData = {
                        id: id,
                        title: getCol('title'),
                        coverImage: getCol('coverImage') || null,
                        backgroundImage: getCol('backgroundImage') || null,
                        releaseDate: parseDate(getCol('releaseDate')),
                        description: getCol('description') || null,
                        screenshots: getCol('screenshots') ? JSON.parse(getCol('screenshots')) : [],
                        videos: getCol('videos') ? JSON.parse(getCol('videos')) : [],
                        steamUrl: getCol('steamUrl') || null,
                        opencriticUrl: getCol('opencriticUrl') || null,
                        igdbUrl: getCol('igdbUrl') || null,
                        hltbUrl: getCol('hltbUrl') || null,
                        opencriticScore: parseIntSafe(getCol('opencriticScore')),
                        igdbScore: parseIntSafe(getCol('igdbScore')),
                        steamAppId: getCol('steamAppId') || null,
                        steamReviewScore: getCol('steamReviewScore') || null,
                        steamReviewCount: parseIntSafe(getCol('steamReviewCount')),
                        steamReviewPercent: parseIntSafe(getCol('steamReviewPercent')),
                        isDlc: getCol('isDlc') === 'true',
                        igdbId: getCol('igdbId') || null,
                        studio: getCol('studio') || null,
                        // Note: 'genres' is stored as a JSON string in Prisma (String?),
                        // so we pass the string value directly.
                        // 'platforms' is stored as a Json object (Json?), so we must parse it.
                        genres: getCol('genres') || null,
                        platforms: getCol('platforms') ? JSON.parse(getCol('platforms')) : null,
                        igdbTime: getCol('igdbTime') ? JSON.parse(getCol('igdbTime')) : null,
                        dataMissing: getCol('dataMissing') === 'true',
                        dataFetched: getCol('dataFetched') === 'true',
                        hltbMain: parseIntSafe(getCol('hltbMain')),
                        hltbExtra: parseIntSafe(getCol('hltbExtra')),
                        hltbCompletionist: parseIntSafe(getCol('hltbCompletionist')),
                    };

                    // Check if game exists
                    const existingGame = await prisma.game.findUnique({
                        where: { id: id }
                    });

                    if (existingGame) {
                        // Update ONLY empty fields
                        const updateData: any = {};
                        let hasUpdates = false;

                        for (const key of Object.keys(csvData) as (keyof typeof csvData)[]) {
                            if (key === 'id') continue;

                            // Check if existing value is "empty"
                            const existingVal = (existingGame as any)[key];
                            const newVal = (csvData as any)[key];

                            const isEmpty = existingVal === null || existingVal === '' || (Array.isArray(existingVal) && existingVal.length === 0);

                            if (isEmpty && newVal !== null && newVal !== '' && !(Array.isArray(newVal) && newVal.length === 0)) {
                                updateData[key] = newVal;
                                hasUpdates = true;
                            }
                        }

                        if (hasUpdates) {
                            await prisma.game.update({
                                where: { id: id },
                                data: updateData
                            });
                            updatedCount++;
                        } else {
                            skippedCount++;
                        }

                    } else {
                        // Create new game
                        // Note: steamAppId must be unique. If another game has same steamAppId, this might fail.
                        try {
                            await prisma.game.create({
                                data: csvData
                            });
                            createdCount++;
                        } catch (e: any) {
                             if (e.code === 'P2002') {
                                // Unique constraint failed (likely steamAppId or igdbId conflict)
                                // console.warn(`Skipping create for ${id} due to unique constraint: ${e.message}`);
                                skippedCount++;
                            } else {
                                throw e;
                            }
                        }
                    }

                } catch (err) {
                    console.error(`Error processing line in ${file}:`, err);
                }
            }));

            processedCount += chunk.length;
            if (processedCount % 500 === 0) {
                console.log(`  Processed ${processedCount} rows...`);
            }
        }
        console.log(`Finished ${file}: Created ${createdCount}, Updated ${updatedCount}, Skipped ${skippedCount}`);
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
