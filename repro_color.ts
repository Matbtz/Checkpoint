
import { extractDominantColors } from './lib/color-utils.ts';

async function test() {
    console.log("Testing color extraction...");
    const url = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7x.jpg"; // Cyberpunk 2077 cover
    console.log(`URL: ${url}`);
    try {
        const colors = await extractDominantColors(url);
        console.log("Colors:", colors);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
