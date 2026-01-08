
import { searchIgdbGames } from '../lib/igdb';
import { searchRawgGames } from '../lib/rawg';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const query = "Super Mario Odyssey";
    console.log(`Searching for "${query}"...`);

    console.log("--- IGDB ---");
    try {
        const igdbResults = await searchIgdbGames(query, 5);
        console.log(`IGDB Found: ${igdbResults.length}`);
        igdbResults.forEach(g => console.log(`- [${g.id}] ${g.name} (${g.category})`));
    } catch (e) {
        console.error("IGDB Error:", e);
    }

    console.log("\n--- RAWG ---");
    try {
        const rawgResults = await searchRawgGames(query, 5);
        console.log(`RAWG Found: ${rawgResults.length}`);
        rawgResults.forEach(g => console.log(`- [${g.id}] ${g.name} (Released: ${g.released}, Rating: ${g.rating})`));
    } catch (e) {
        console.error("RAWG Error:", e);
    }
}

main();
