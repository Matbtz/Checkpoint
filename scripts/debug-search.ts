
import './env-loader';
import { searchIgdbGames } from '../lib/igdb';

function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

async function main() {
    const title = "Super Mario Odyssey";
    const releaseDate = new Date("2017-10-27"); // Local date
    const releaseYear = 2017;

    console.log(`Searching for: ${title} (${releaseYear})`);

    try {
        const results = await searchIgdbGames(title, 20); // Check 20 results
        console.log(`Found ${results.length} results.`);

        let bestCandidate = null;
        let bestScore = -1000; // Lower baseline

        for (const res of results) {
            console.log(`\n--- Candidate: ${res.name} (ID: ${res.id}) ---`);
            const type = res.category ?? res.game_type ?? 0;
            console.log(`   Type: ${type} | Date: ${res.first_release_date ? new Date(res.first_release_date * 1000).toISOString() : 'N/A'}`);

            const cYear = res.first_release_date ? new Date(res.first_release_date * 1000).getFullYear() : null;

            let score = 0;

            // 1. Game Type Filter/Penalty
            let typeScore = 0;
            if (type === 3 || type === 13 || type === 14) {
                typeScore = -100;
                console.log(`   -100 Type Penalty (Bundle/Update)`);
            } else if (type === 1 || type === 2) {
                typeScore = -20;
                console.log(`   -20 Type Penalty (DLC)`);
            }
            score += typeScore;

            // 2. Exact Name Match Bonus
            const normRes = normalize(res.name);
            const normTitle = normalize(title);
            if (normRes === normTitle) {
                score += 50;
                console.log(`   +50 Exact Name`);
            } else {
                console.log(`   No Name Match ("${normRes}" vs "${normTitle}")`);
            }

            // 3. Date Match Bonus
            if (cYear && releaseDate) {
                const diff = Math.abs(releaseYear - cYear);
                if (diff === 0) {
                    score += 60;
                    console.log(`   +60 Perfect Date Match (${cYear})`);
                } else if (diff <= 1) {
                    score += 50;
                    console.log(`   +50 Close Date Match (${cYear} vs ${releaseYear})`);
                } else {
                    score -= 30;
                    console.log(`   -30 Date Mismatch (${cYear})`);
                }
            } else {
                console.log(`   Date Missing or Invalid`);
            }

            // Special Case: DLC Title Override
            if (title.toLowerCase().includes('dlc') || title.toLowerCase().includes('season pass')) {
                if (type === 1 || type === 2) {
                    score += 50;
                    console.log(`   +50 DLC Title Override`);
                }
            }

            console.log(`   Total Score: ${score}`);

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = res;
                console.log(`   🏆 New Best!`);
            } else if (score === bestScore) {
                const typeA = bestCandidate ? (bestCandidate.category ?? bestCandidate.game_type ?? 0) : 100;
                const typeB = res.category ?? res.game_type ?? 0;

                const priority = (t: number) => {
                    if (t === 0) return 0; // Main
                    if (t === 8 || t === 9) return 1; // Remake/Remaster
                    if (t === 4 || t === 10) return 2; // Standalone/Expanded
                    if (t === 1 || t === 2) return 3; // DLC
                    return 4; // Other
                };

                console.log(`   ⚠️ Tie! Priority: New(${typeB}=${priority(typeB)}) vs Best(${typeA}=${priority(typeA)})`);

                if (priority(typeB) < priority(typeA)) {
                    bestCandidate = res;
                    console.log(`   🏆 New Best (Tie-Breaker)!`);
                }
            }
        }

        console.log("\nWINNER:");
        if (bestCandidate) {
            console.log(JSON.stringify(bestCandidate, null, 2));
            console.log(`FINAL WINNER: ${bestCandidate.name} (Type ${bestCandidate.category ?? bestCandidate.game_type})`);
        } else {
            console.log("No winner found.");
        }

    } catch (e) {
        console.error(e);
    }
}

main();
