const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Manually set env if needed, but Prisma Client usually reads from .env if initialized correctly or passed in options.
// The error suggests it didn't find the correct URL format in the environment variable loaded by Prisma.
// Let's force it.

process.env.DATABASE_URL = "file:./dev.db";

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding data...');
  const email = 'verification@example.com';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Verification User',
      password: hashedPassword,
    },
  });
  console.log('User seeded:', user.email);

  // Counter-Strike (Released)
  const game = await prisma.game.upsert({
    where: { id: '10' },
    update: {
        title: 'Counter-Strike',
        coverImage: 'https://cdn.akamai.steamstatic.com/steam/apps/10/header.jpg',
        releaseDate: new Date('2000-11-01'),
        genres: JSON.stringify(['Action']),
        hltbTimes: JSON.stringify({ main: 10, extra: 20, completionist: 50 }),
        scores: JSON.stringify({ openCritic: 90, rawg: 85 }),
    },
    create: {
        id: '10',
        title: 'Counter-Strike',
        coverImage: 'https://cdn.akamai.steamstatic.com/steam/apps/10/header.jpg',
        releaseDate: new Date('2000-11-01'),
        genres: JSON.stringify(['Action']),
        hltbTimes: JSON.stringify({ main: 10, extra: 20, completionist: 50 }),
        scores: JSON.stringify({ openCritic: 90, rawg: 85 }),
    }
  });
  console.log('Game seeded:', game.title);

  await prisma.userLibrary.upsert({
      where: {
          userId_gameId: {
              userId: user.id,
              gameId: game.id
          }
      },
      update: {
          status: 'Playing',
          playTimeSteam: 600,
      },
      create: {
          userId: user.id,
          gameId: game.id,
          status: 'Playing',
          playTimeSteam: 600, // 10 hours
      }
  });
  console.log('UserLibrary seeded: CS');

  // Future Game
  const futureGame = await prisma.game.upsert({
    where: { id: '99999' },
    update: {
        title: 'Half-Life 3',
        releaseDate: new Date(Date.now() + 86400000 * 3), // 3 days from now
        genres: JSON.stringify(['Sci-Fi']),
        hltbTimes: JSON.stringify({ main: 15 }),
    },
    create: {
        id: '99999',
        title: 'Half-Life 3',
        coverImage: '',
        releaseDate: new Date(Date.now() + 86400000 * 3), // 3 days from now
        genres: JSON.stringify(['Sci-Fi']),
        hltbTimes: JSON.stringify({ main: 15 }),
    }
  });
  console.log('Game seeded:', futureGame.title);

  await prisma.userLibrary.upsert({
      where: {
          userId_gameId: {
              userId: user.id,
              gameId: futureGame.id
          }
      },
      update: {
          status: 'Wishlist',
      },
      create: {
          userId: user.id,
          gameId: futureGame.id,
          status: 'Wishlist',
      }
  });
  console.log('UserLibrary seeded: HL3');

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
