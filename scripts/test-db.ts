
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Fetching user library...');
    // This query triggers the error if the 'platforms' column is missing in the Game table
    // because Prisma Client expects it to exist (based on schema) and selects it.
    const library = await prisma.userLibrary.findMany({
      take: 1,
      include: {
        game: true,
      },
    });
    console.log('Successfully fetched library entry:', library.length > 0 ? 'Found entries' : 'No entries found');
    if (library.length > 0) {
      console.log('Game platforms:', library[0].game.platforms);
    }
  } catch (error) {
    console.error('Error fetching library:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
