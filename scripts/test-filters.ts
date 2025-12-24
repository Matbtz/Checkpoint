import { loadEnvConfig } from '@next/env';
import fs from 'fs';
import path from 'path';

async function getValidToken(clientId: string, clientSecret: string): Promise<string> {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
        method: 'POST'
    });

    if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
}

async function main() {
    loadEnvConfig(process.cwd());

    const logFile = path.join(process.cwd(), 'scripts', 'test_output.txt');
    const log = (msg: string) => {
        console.log(msg);
        fs.appendFileSync(logFile, msg + '\n');
    };

    fs.writeFileSync(logFile, '');

    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_SECRET;

    if (!clientId || !clientSecret) {
        log("ERROR: Missing IGDB_CLIENT_ID or IGDB_SECRET");
        return;
    }

    log("Obtaining new access token...");
    let accessToken: string;
    try {
        accessToken = await getValidToken(clientId, clientSecret);
        log("Token obtained successfully.");
    } catch (e) {
        log(`Failed to get token: ${e}`);
        return;
    }

    const year = 2025;
    const startDate = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
    const endDate = Math.floor(new Date(`${year + 1}-01-01T00:00:00Z`).getTime() / 1000);

    log(`Testing filters for year ${year} (Date range: ${startDate} - ${endDate})`);

    const filters = [
        { name: "No Filter (Baseline)", condition: "" },
        { name: "Ratings >= 5", condition: "& total_rating_count >= 5" },
        { name: "Ratings >= 10", condition: "& total_rating_count >= 10" },
        { name: "Ratings >= 20", condition: "& total_rating_count >= 20" },
        { name: "Hypes >= 5", condition: "& hypes >= 5" },
        { name: "Hypes >= 10", condition: "& hypes >= 10" },
        { name: "Ratings >= 5 OR Hypes >= 3", condition: "& (total_rating_count >= 5 | hypes >= 3)" },
        { name: "Ratings >= 5 OR Hypes >= 5", condition: "& (total_rating_count >= 5 | hypes >= 5)" },
        { name: "Ratings >= 10 OR Hypes >= 5", condition: "& (total_rating_count >= 10 | hypes >= 5)" },
        { name: "Ratings >= 5 OR Hypes >= 2 (Loose)", condition: "& (total_rating_count >= 5 | hypes >= 2)" },
    ];

    for (const filter of filters) {
        // IGDB query syntax: everything in body
        const query = `where first_release_date >= ${startDate} & first_release_date < ${endDate} ${filter.condition};`;

        try {
            const response = await fetch('https://api.igdb.com/v4/games/count', {
                method: 'POST',
                headers: {
                    'Client-ID': clientId,
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                },
                body: query,
            });

            if (!response.ok) {
                const text = await response.text();
                log(`Filter: [${filter.name.padEnd(30)}] -> HTTP ERROR ${response.status}: ${text}`);
                continue;
            }

            const result = await response.json();
            // Expected { count: 123 }
            const count = result.count;

            log(`Filter: [${filter.name.padEnd(30)}] -> Count: ${count}`);

            await new Promise(r => setTimeout(r, 250));

        } catch (error) {
            log(`Error testing filter ${filter.name}: ${error}`);
        }
    }
}

main().catch(console.error);
