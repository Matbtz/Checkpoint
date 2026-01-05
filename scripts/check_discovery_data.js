
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
    const now = new Date();
    // Logic from discovery.ts for Top Rated (Jan/Feb)
    const currentYear = 2026;
    const prevYear = 2025;
    const startOfRatingPeriod = new Date(prevYear, 0, 1);
    const endOfRatingPeriod = new Date(prevYear, 11, 31, 23, 59, 59);

    console.log(`Checking for games between ${startOfRatingPeriod.toISOString()} and ${endOfRatingPeriod.toISOString()}`);

    const topRated = await prisma.game.findMany({
        where: {
            releaseDate: {
                gte: startOfRatingPeriod,
                lte: endOfRatingPeriod
            },
            opencriticScore: {
                not: null
            }
        },
        orderBy: {
            opencriticScore: 'desc'
        },
        take: 5
    });

    console.log(`Found ${topRated.length} Top Rated games for 2025.`);
    if (topRated.length > 0) {
        console.log("Sample:", topRated[0].title, topRated[0].releaseDate, topRated[0].opencriticScore);
    }

    const recentlyReviewed = await prisma.game.findMany({
        where: {
            opencriticScore: {
                gte: 80
            },
            releaseDate: {
                lte: now
            }
        },
        orderBy: {
            releaseDate: 'desc'
        },
        take: 5
    });

    console.log(`Found ${recentlyReviewed.length} Recently Reviewed games.`);
    if (recentlyReviewed.length > 0) {
        console.log("Sample:", recentlyReviewed[0].title, recentlyReviewed[0].releaseDate, recentlyReviewed[0].opencriticScore);
    }
}

checkData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
