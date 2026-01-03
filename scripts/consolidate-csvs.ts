
import fs from 'fs';
import path from 'path';

const INPUT_DIR = path.join(process.cwd(), 'scripts', 'csv');
const OUTPUT_FILE = path.join(process.cwd(), 'scripts', 'csv', 'merged_all_games.csv');

function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`Directory ${INPUT_DIR} does not exist.`);
        process.exit(1);
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.csv') && !f.startsWith('merged_all') && !f.startsWith('enrich_results'));

    if (files.length === 0) {
        console.log("No CSV files found to merge.");
        return;
    }

    console.log(`Found ${files.length} CSV files to merge.`);
    const writeStream = fs.createWriteStream(OUTPUT_FILE);

    let headerWritten = false;
    let totalRows = 0;

    // Deduplication Set: "normalized_title|year"
    const existingGames = new Set<string>();

    // Normalization Helper (Simple Alphanumeric)
    function getDedupKey(title: string, date: string): string {
        if (!title) return '';
        const normTitle = title.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]/g, ""); // remove non-alphanumeric

        let year = '0000';
        if (date && date.length >= 4) {
            year = date.substring(0, 4);
        }
        return `${normTitle}|${year}`;
    }

    // Prioritize 'merged_games.csv' to be the Source of Truth
    // Sort files so merged_games.csv comes first
    files.sort((a, b) => {
        if (a === 'merged_games.csv') return -1;
        if (b === 'merged_games.csv') return 1;
        return a.localeCompare(b);
    });

    for (const file of files) {
        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(path.join(INPUT_DIR, file), 'utf-8');
        const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

        if (lines.length === 0) continue;

        // Header handling
        if (!headerWritten) {
            writeStream.write(lines[0] + '\n');
            headerWritten = true;
        }

        // Identify indices for Title (1) and ReleaseDate (4)
        // Header: id|title|coverImage|backgroundImage|releaseDate|...
        // We assume standard order from our previous checks match.
        // But let's be safe(r)? No, CSV reading here is raw string split.
        // We need to parse the line to get columns safely (handling escaped pipes?)
        // Our 'escapeCsv' helper escapes quotes.
        // Simple split by '|' might fail if '|' is inside quotes.
        // But for deduplication check, we can try best effort or use a regex splitter.

        let skippedCount = 0;
        let fileRows = 0;

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            // Simple Parse (Assuming standard pipe safety we enforced)
            // If split fails due to quoted pipe, we might miss a dupe check, but unlikely for titles.
            const cols = line.split('|');
            // Title is index 1, Date is index 4
            const title = cols[1]?.replace(/^"|"$/g, '') || ''; // remove quotes
            const date = cols[4]?.replace(/^"|"$/g, '') || '';

            const key = getDedupKey(title, date);

            // If matched existing, SKIP (unless it's the first file 'merged_games.csv' itself - wait, we iterate it. 
            // We want to add all from merged_games.csv, then filter others.)
            if (file !== 'merged_games.csv' && existingGames.has(key)) {
                skippedCount++;
                continue;
            }

            // Add to Set
            if (key) existingGames.add(key);

            writeStream.write(line + '\n');
            totalRows++;
            fileRows++;
        }
        console.log(`  -> Added ${fileRows} rows (Skipped ${skippedCount} duplicates)`);
    }

    writeStream.end();
    console.log(`\n✅ Merged ${totalRows} rows into ${OUTPUT_FILE}`);
}

main();
