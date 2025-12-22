
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking Games for Discovery Sections ---');

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const sixtyDaysFuture = new Date(today);
  sixtyDaysFuture.setDate(today.getDate() + 60);

  console.log(`Today: ${today.toISOString()}`);
  console.log(`30 Days Ago: ${thirtyDaysAgo.toISOString()}`);
  console.log(`60 Days Future: ${sixtyDaysFuture.toISOString()}`);

  // Check Recent Releases
  const recentGames = await prisma.game.findMany({
    where: {
      releaseDate: {
        gte: thirtyDaysAgo,
        lte: today,
      },
    },
    select: { id: true, title: true, releaseDate: true },
  });
  console.log(`\nRecent Releases Found: ${recentGames.length}`);
  recentGames.forEach(g => console.log(` - ${g.title} (${g.releaseDate?.toISOString()})`));

  // Check Upcoming Games
  const upcomingGames = await prisma.game.findMany({
    where: {
      releaseDate: {
        gt: today,
        lte: sixtyDaysFuture,
      },
    },
    select: { id: true, title: true, releaseDate: true },
  });
  console.log(`\nUpcoming Games Found: ${upcomingGames.length}`);
  upcomingGames.forEach(g => console.log(` - ${g.title} (${g.releaseDate?.toISOString()})`));

  // Check Wishlist Status
  const wishlistCounts = await prisma.userLibrary.groupBy({
    by: ['gameId'],
    where: { status: 'WISHLIST' },
    _count: { gameId: true },
    orderBy: { _count: { gameId: 'desc' } },
    take: 5,
  });
  console.log(`\nWishlist Entries Found: ${wishlistCounts.length}`);
  console.log(wishlistCounts);

  // Check generic "Top Rated" candidates (to ensure fallback works)
  const topRated = await prisma.game.findMany({
    orderBy: { opencriticScore: 'desc' },
    take: 5,
    select: { title: true, opencriticScore: true }
  });
  console.log('\nTop Rated Candidates:');
  topRated.forEach(g => console.log(` - ${g.title}: ${g.opencriticScore}`));

  // Check total games count
  const totalGames = await prisma.game.count();
  console.log(`\nTotal Games in DB: ${totalGames}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
