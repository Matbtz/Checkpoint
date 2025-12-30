
import './env-loader';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

async function testPlatform(id: number, name: string) {
    const url = `https://opencritic-api.p.rapidapi.com/game?platforms=${id}&sort=newest`;
    console.log(`Testing ${name} (ID: ${id})...`);
    try {
        const res = await fetch(url, {
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY!,
                'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
            }
        });
        const games = await res.json();
        if (Array.isArray(games) && games.length > 0) {
            console.log(`✅ ${name}: Found ${games.length} games. First: "${games[0].name}"`);
            // console.log(JSON.stringify(games[0], null, 2)); 
        } else {
            console.log(`❌ ${name}: No games found or invalid response.`);
        }
    } catch (e) {
        console.error(`❌ ${name}: Error`, e);
    }
}

async function main() {
    await testPlatform(26, "Switch");
    await testPlatform(39, "PS5");
    await testPlatform(27, "PC");
    await testPlatform(40, "Xbox Series X");
}

main();
