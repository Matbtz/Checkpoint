import 'dotenv/config';
import { searchRawgGames } from "../lib/rawg";

async function main() {
    // Test with a query likely to have fan games (e.g. "Pokemon")
    const query = "Pokemon";
    console.log(`Searching RAWG for: ${query}`);
    try {
        const results = await searchRawgGames(query, 10);
        console.log(`Found ${results.length} results.`);
        results.forEach(g => {
            console.log(`- [${g.id}] ${g.name} (Released: ${g.released}, Reviews: ${g.reviews_count}, Rating: ${g.rating})`);
        });
    } catch (error) {
        console.error("Search failed:", error);
    }
}

main();
