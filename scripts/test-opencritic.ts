
import { getOpenCriticScore } from '../lib/opencritic';

async function test() {
    console.log("Testing OpenCritic fetch for 'Hades'...");
    const result = await getOpenCriticScore('Hades');
    console.log("Result:", result);

    if (result.score !== null && result.url !== null) {
        console.log("SUCCESS: Got both score and URL.");
        if (result.url.includes('opencritic.com/game/')) {
             console.log("URL format looks correct.");
        } else {
             console.log("URL format suspicious:", result.url);
        }
    } else {
        console.log("FAILURE: Missing score or URL.");
    }
}

test().catch(console.error);
