import 'dotenv/config';
import { searchIgdbGames } from "../lib/igdb";

async function main() {
    const query = "Elden Ring";
    console.log(`Searching for: ${query}`);
    try {
        const results = await searchIgdbGames(query, 10);
        console.log(`Found ${results.length} results.`);
        results.forEach(g => {
            console.log(`- [${g.id}] ${g.name} (Type: ${g.game_type})`);
        });
    } catch (error) {
        console.error("Search failed:", error);
    }
}

main();
