
import { searchHowLongToBeat } from '../lib/hltb';

async function run() {
  console.log("Testing HLTB Real Connection...");
  const result = await searchHowLongToBeat("Hades II");
  if (result) {
    console.log("✅ Success:", result);
  } else {
    console.log("❌ Failed (null returned). Check logs for details.");
  }
}

run();
