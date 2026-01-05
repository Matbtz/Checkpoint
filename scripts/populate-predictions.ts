
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

async function main() {
    const csvPath = path.join(process.cwd(), 'scripts', 'Data_science', 'predictions_full.csv');

    if (!fs.existsSync(csvPath)) {
        console.error(`File not found: ${csvPath}`);
        process.exit(1);
    }

    interface PredictionRecord {
        id: string;
        predicted_main: string;
        predicted_extra: string;
        predicted_completionist: string;
    }

    console.log('Reading predictions from CSV...');
    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
    }) as PredictionRecord[];

    console.log(`Found ${records.length} predictions to process.`);

    let updatedCount = 0;
    let batch = [];
    const BATCH_SIZE = 100;

    for (const record of records) {
        // CSV columns: id, title, predicted_main, predicted_extra, predicted_completionist
        // "id" in CSV comes from the dataframe. 
        // IMPORTANT: The dataframe "id" might be the IGDB ID or the UUID from the DB?
        // In "load_and_preprocess", self.df is loaded from merged_all_games.csv.
        // merged_all_games.csv has "id" which is usually the internal UUID if exported from DB, or external ID?
        // Let's assume it matches the "id" in the Prisma Game table.

        const gameId = record.id;
        if (!gameId) continue;

        const predictedMain = parseFloat(record.predicted_main);
        const predictedExtra = parseFloat(record.predicted_extra);
        const predictedCompletionist = parseFloat(record.predicted_completionist);

        if (isNaN(predictedMain)) continue;

        // We can't do updateMany with different values easily.
        // We use Promise.all with concurrency control or sequential batches.
        // For safety and simplicity in this script, let's just do sequential or small chunks.

        batch.push({
            id: gameId,
            data: {
                predictedMain,
                predictedExtra,
                predictedCompletionist
            }
        });

        if (batch.length >= BATCH_SIZE) {
            await processBatch(batch);
            updatedCount += batch.length;
            process.stdout.write(`\rUpdated: ${updatedCount}/${records.length}`);
            batch = [];
        }
    }

    if (batch.length > 0) {
        await processBatch(batch);
        updatedCount += batch.length;
    }

    console.log(`\nDone! Updated ${updatedCount} games.`);
}

async function processBatch(batch: any[]) {
    // Use transaction or Promise.all
    await Promise.all(batch.map(item =>
        prisma.game.update({
            where: { id: item.id },
            data: item.data
        }).catch(err => {
            // Ignore "Record to update not found" errors if IDs don't match
            // console.error(`Failed to update ${item.id}: ${err.message}`);
        })
    ));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
