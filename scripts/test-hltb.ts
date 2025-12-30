
import { searchHowLongToBeat } from '../lib/hltb';

async function run() {
  console.log("Testing HLTB Search...");

  const testCases = [
    "Hades II",
    "Hades",
    "The Legend of Zelda: Breath of the Wild",
    "Super Fake Game 9000" // Should fail
  ];

  for (const title of testCases) {
    console.log(`\nSearching for: "${title}"...`);
    const result = await searchHowLongToBeat(title);
    if (result) {
      console.log(`✅ Found match:`, result);
      console.log(`   (Main: ${result.main}m, Extra: ${result.extra}m, Comp: ${result.completionist}m)`);
      console.log(`   (Hours approx: ${(result.main/60).toFixed(1)}h, ${(result.extra/60).toFixed(1)}h, ${(result.completionist/60).toFixed(1)}h)`);
    } else {
      console.log(`❌ No match found (or rejected).`);
    }
  }
}

run().catch(console.error);
