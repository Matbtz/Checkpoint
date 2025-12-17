
import { searchRawgGames, getRawgGameDetails } from './lib/rawg';

async function test() {
    console.log("Testing RAWG Details...");
    try {
        const rawgGames = await searchRawgGames("Cyberpunk", 1);
        if (rawgGames.length > 0) {
            const game = rawgGames[0];
            console.log("Search Result - Short Screenshots:", game.short_screenshots?.length);

            const details = await getRawgGameDetails(game.id);
            if (details) {
                 console.log("Details Result - Short Screenshots:", details.short_screenshots?.length);
            } else {
                console.log("Details failed to fetch.");
            }
        }
    } catch (e) {
        console.error("RAWG Error:", e);
    }
}

test();
