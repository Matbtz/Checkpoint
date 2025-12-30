
import './env-loader';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

async function main() {
    const url = `https://opencritic-api.p.rapidapi.com/game?skip=0&sort=newest`;
    console.log(`Fetching games to inspect platforms...`);
    try {
        const res = await fetch(url, {
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY!,
                'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
            }
        });
        console.log(`Status: ${res.status} ${res.statusText}`);
        const games = await res.json();
        console.log("Response Preview:", JSON.stringify(games).substring(0, 200));

        if (Array.isArray(games) && games.length > 0) {
            console.log(`Analyzing ${games.length} games...`);
            console.log("Sample keys:", Object.keys(games[0]));
            const platforms = new Map();
            games.forEach((g: any) => {
                const pList = g.Platforms || g.platforms;
                if (pList) {
                    pList.forEach((p: any) => {
                        platforms.set(p.id, p.name);
                    });
                }
            });
            console.log("Found Platforms:");
            platforms.forEach((name, id) => {
                console.log(`ID: ${id} = ${name}`);
            });
        }
    } catch (e) {
        console.error(`Error`, e);
    }
}

main();
