import 'dotenv/config';
import { getIgdbTimeToBeat, getValidToken } from '../lib/igdb';

async function test() {
    // Known game ID: 1761 (Warframe?) or just try a valid one if we know it.
    // In the logs: Warframe (2013).
    // Let's assume we can fetch Warframe by name first to get ID, or just trust the ID from the logs if it was visible.
    // Actually, I'll just check if the function throws 404 with the NEW endpoint name.

    // But I can't easily change the lib and test without saving.
    // So I will write a script that imports specific internals or just uses fetch directly to test the endpoint.

    const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
    const token = await getValidToken();

    if (!IGDB_CLIENT_ID || !token) {
        console.error("Missing credentials or failed to get token");
        return;
    }

    async function checkEndpoint(name: string) {
        console.log(`Checking endpoint: ${name}`);
        const response = await fetch(`https://api.igdb.com/v4/${name}`, {
            method: 'POST',
            headers: {
                'Client-ID': IGDB_CLIENT_ID!,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            body: 'fields *; limit 1;'
        });

        console.log(`Endpoint ${name}: status ${response.status}`);
        if (response.ok) {
            console.log(await response.json());
        }
    }

    await checkEndpoint('time_to_beat');
    await checkEndpoint('time_to_beats');
    await checkEndpoint('game_time_to_beat');
    await checkEndpoint('game_time_to_beats');
}

test();
