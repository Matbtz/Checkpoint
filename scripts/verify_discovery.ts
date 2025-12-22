
import { getCachedDiscoveryGames, getMostAnticipatedGames } from '../actions/discovery';

async function verifyDiscovery() {
    console.log("--- Verifying Discovery Actions ---");

    console.log("Fetching TOP_RATED...");
    const topRated = await getCachedDiscoveryGames('TOP_RATED');
    console.log(`TOP_RATED: Found ${topRated.length} games.`);
    if (topRated.length > 0) console.log(`Sample: ${topRated[0].title} (${topRated[0].opencriticScore})`);

    console.log("\nFetching RECENT...");
    const recent = await getCachedDiscoveryGames('RECENT');
    console.log(`RECENT: Found ${recent.length} games.`);
    if (recent.length > 0) console.log(`Sample: ${recent[0].title} (${recent[0].releaseDate})`);

    console.log("\nFetching UPCOMING...");
    const upcoming = await getCachedDiscoveryGames('UPCOMING');
    console.log(`UPCOMING: Found ${upcoming.length} games.`);

    console.log("\nFetching MOST ANTICIPATED...");
    const anticipated = await getMostAnticipatedGames();
    console.log(`ANTICIPATED: Found ${anticipated.length} games.`);
    if (anticipated.length > 0) console.log(`Sample: ${anticipated[0].title}`);
}

verifyDiscovery().catch(console.error);
