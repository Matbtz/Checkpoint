import { searchHowLongToBeat } from '../lib/hltb';

async function main() {
    const game = "Portal 2";
    console.log(`Searching for ${game}...`);
    const result = await searchHowLongToBeat(game);
    console.log("Result:", result);
    if (result?.url) {
        console.log("✅ URL found:", result.url);
    } else {
        console.error("❌ No URL found");
    }
}

main();
