
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Find a game that was likely updated/created, e.g. GTA VI or any upcoming
    // Search for games with relatedGames not null
    const games = await prisma.game.findMany({
        where: {
            title: { contains: 'Grand Theft Auto VI' }
        },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        select: {
            title: true,
            relatedGames: true,
            storyline: true,
            videos: true,
            keywords: true,
            updatedAt: true
        }
    });

    console.log(`Found ${games.length} games with relatedGames:`);
    games.forEach(g => {
        console.log(`\nTitle: ${g.title}`);
        console.log(`Storyline: ${g.storyline ? g.storyline.substring(0, 50) + '...' : 'NONE'}`);
        console.log(`Videos: ${g.videos.length}`);
        console.log(`Keywords: ${g.keywords.length}`);
        console.log(`Related Games:`, JSON.stringify(g.relatedGames, null, 2));
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
