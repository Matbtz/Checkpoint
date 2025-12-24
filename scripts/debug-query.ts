
import { loadEnvConfig } from '@next/env';

async function main() {
    loadEnvConfig(process.cwd());
    const { fetchIgdb } = await import('../lib/igdb');

    const year = 2024;
    const startDate = Math.floor(new Date(`${year}-01-01T00:00:00Z`).getTime() / 1000);
    const endDate = Math.floor(new Date(`${year + 1}-01-01T00:00:00Z`).getTime() / 1000);

    const query = `
            fields name, slug, url, category, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, total_rating_count, hypes,
                   involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                   screenshots.image_id, artworks.image_id, videos.video_id, videos.name, genres.name, platforms.name,
                   websites.url, websites.category, external_games.uid, external_games.category;
            where first_release_date >= ${startDate} & first_release_date < ${endDate} & (total_rating_count >= 5 | hypes >= 2);
            limit 10;
        `;

    console.log("Testing Query:\n", query);

    try {
        const results = await fetchIgdb('games', query);
        console.log(`Results: ${results.length}`);
        if (results.length > 0) {
            console.log("First result:", results[0].name);
        } else {
            // Try a simpler query to verify token
            console.log("Zero results. Trying simpler query...");
            const simple = `fields name; limit 1;`;
            const r2 = await fetchIgdb('games', simple);
            console.log(`Simple query results: ${r2.length}`);
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
