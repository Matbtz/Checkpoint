
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting CSV parse + single insert test...');

    try {
        await prisma.game.deleteMany({});

        const csvFilePath = path.join(process.cwd(), 'games_seed_supabase.csv');
        const fileContent = fs.readFileSync(csvFilePath, 'utf-8');

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
        }, async (err, records) => {
            if (err) throw err;

            const row = records[0];
            console.log('Parsed row 0 ID:', row.id);

            const parseIntSafe = (v: any) => (v ? parseInt(v, 10) : null);
            const safeDate = (d: any) => d ? new Date(d) : null;

            let platformsJson = undefined;
            if (row.platforms) {
                platformsJson = JSON.parse(row.platforms);
            }

            const dataToInsert = {
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

            console.log('Inserting parsed row...');
            // console.log(JSON.stringify(dataToInsert, null, 2));

            await prisma.game.create({
                data: dataToInsert,
            });
            console.log('✅ Parsed insert successful.');
        });

    } catch (e) {
        console.error('❌ Parsed insert failed:', e);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        // Wait a bit before exit to allow async parse callback to maybe run if it was called
        // But here main end is synchronous after parse call. Parse is async.
        // We need to wait for parse callback. 
        // Actually parse is callback based. safely main exits.
        // But we need to keep process alive? 
        // Main returns prompt.
    });
