
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Verifying imported data...");

    const count = await prisma.game.count();
    console.log(`Total games in DB: ${count}`);

    if (count === 0) {
        console.error("No games found!");
        return;
    }

    // Check a few games with expected rich data
    const games = await prisma.game.findMany({
        take: 5,
        where: {
            description: { not: null },
            platforms: { not: null }
        }
    });

    console.log(`Found ${games.length} games with description and platforms.`);

    for (const game of games) {
        console.log(`\n--- Game: ${game.title} ---`);
        console.log(`ID: ${game.id}`);
        console.log(`Description: ${game.description ? game.description.substring(0, 50) + '...' : 'MISSING'}`);
        console.log(`Platforms: ${JSON.stringify(game.platforms)}`);
        console.log(`Screenshots: ${game.screenshots.length}`);
        console.log(`HLTB Main: ${game.hltbMain}`);
        console.log(`HLTB Extra: ${game.hltbExtra}`);
        console.log(`Themes: ${game.themes}`);
    }
}

main()
    .finally(async () => {
        await prisma.$disconnect();
    });
