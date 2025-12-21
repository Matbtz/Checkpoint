
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Clear existing data
    console.log('🧹 Clearing existing data...');
    try {
        await prisma.userLibrary.deleteMany({});
        await prisma.activityLog.deleteMany({});
        await prisma.game.deleteMany({});
        console.log('✅ Data cleared.');
    } catch (e) {
        console.warn('⚠️  Data clear failed (maybe tables empty):', e);
    }

    // 2. Read and parse CSV
    const csvFilePath = path.join(process.cwd(), 'games_seed_supabase.csv');
    console.log(`📖 Reading CSV from ${csvFilePath}...`);

    const fileContent = fs.readFileSync(csvFilePath, 'utf-8');

    // Promisify parse
    const records = await new Promise<any[]>((resolve, reject) => {
        parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            cast: (value, context) => {
                if (value === 'True') return true;
                if (value === 'False') return false;
                if (value === '' && context.column !== 'id' && context.column !== 'title') {
                    return null;
                }
                return value;
            }
        }, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    console.log(`🧩 Parsed ${records.length} records. Preparing for insertion...`);

    // 3. Batch insert
    const BATCH_SIZE = 100; // Try 100
    const chunks = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        chunks.push(records.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 Created ${chunks.length} chunks.`);

    for (const [index, chunk] of chunks.entries()) {
        const dataToInsert = chunk.map((row: any): any => {
            const parseIntSafe = (v: any) => (v ? parseInt(v, 10) : null);
            const safeDate = (d: any) => d ? new Date(d) : null;

            let platformsJson = undefined;
            try {
                if (row.platforms) {
                    platformsJson = JSON.parse(row.platforms);
                }
            } catch (e) {
                console.warn(`Warning: Failed to parse platforms JSON for game ${row.id}`, e);
            }

            return {
                id: row.id.toString(),
                title: row.title,
                steamUrl: row.steamUrl,
                steamAppId: row.steamAppId ? row.steamAppId.toString() : null,
                description: row.description,
                coverImage: row.coverImage,
                backgroundImage: row.backgroundImage,
                releaseDate: safeDate(row.releaseDate),

                steamReviewScore: row.steamReviewScore,
                steamReviewCount: parseIntSafe(row.steamReviewCount),
                steamReviewPercent: parseIntSafe(row.steamReviewPercent),

                opencriticScore: parseIntSafe(row.opencriticScore),

                isDlc: Boolean(row.isDlc),
                studio: row.studio,

                genres: row.genres,
                platforms: platformsJson,

                hltbMain: parseIntSafe(row.hltbMain),
                hltbExtra: parseIntSafe(row.hltbExtra),
                hltbCompletionist: parseIntSafe(row.hltbCompletionist),

                dataFetched: Boolean(row.dataFetched),
                dataMissing: Boolean(row.dataMissing),
                updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
            };
        });

        process.stdout.write(`\r⏳ Processing chunk ${index + 1}/${chunks.length}...`);

        try {
            await prisma.game.createMany({
                data: dataToInsert,
                skipDuplicates: true,
            });
        } catch (insertError: any) {
            console.error(`\n❌ Error inserting chunk ${index + 1}:`);
            console.error('Error message:', insertError.message);
            // We'll try to continue
        }
    }

    console.log('\n✨ Seed completed successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
