
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Backfill of opencriticScoreUpdatedAt...");

    // 1. Find games with a score but no score date
    const gamesToUpdate = await prisma.game.findMany({
        where: {
            opencriticScore: { not: null },
            opencriticScoreUpdatedAt: null
        },
        select: { id: true, releaseDate: true, updatedAt: true, title: true }
    });

    console.log(`Found ${gamesToUpdate.length} games to backfill.`);

    let updatedCount = 0;

    for (const game of gamesToUpdate) {
        // Fallback: Release Date -> Updated At -> Now
        const dateToSet = game.releaseDate || game.updatedAt || new Date();

        await prisma.game.update({
            where: { id: game.id },
            data: { opencriticScoreUpdatedAt: dateToSet }
        });

        updatedCount++;
        if (updatedCount % 100 === 0) {
            console.log(`Updated ${updatedCount}/${gamesToUpdate.length} games...`);
        }
    }

    console.log(`✅ Backfill complete! Updated ${updatedCount} games.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
