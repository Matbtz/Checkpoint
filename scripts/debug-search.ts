
import { searchGamesMultiProvider } from '../actions/add-game';

async function main() {
    console.log("Searching for 'The Legend of Zelda: Breath of the Wild'...");
    try {
        const results = await searchGamesMultiProvider("The Legend of Zelda: Breath of the Wild");
        console.log(`Found ${results.length} results.`);
        results.forEach((r: any) => {
            console.log(`\nTitle: ${r.name}`);
            console.log(`ID: ${r.id}`);
            console.log(`Covers: ${r.extraCovers?.length || 0} extra + 1 main`);
            console.log(`Backgrounds: ${r.extraBackgrounds?.length || 0} extra + 1 main`);
            if (r.extraCovers?.length === 0) {
                 console.log("DEBUG: No extra covers found. Check matching.");
            }
        });
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
