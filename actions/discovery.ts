'use server';

import { prisma } from '@/lib/db';
import { startOfYear, subDays, addDays, startOfDay } from 'date-fns';

export async function getTopRatedGames() {
  const currentYear = new Date().getFullYear();
  const startDate = startOfYear(new Date(currentYear, 0, 1));
  const today = startOfDay(new Date());

  const games = await prisma.game.findMany({
    where: {
      releaseDate: {
        gte: startDate,
        lte: today,
      },
      opencriticScore: {
        not: null,
      },
    },
    orderBy: {
      opencriticScore: 'desc',
    },
    take: 50,
  });

  return games;
}

export async function getRecentReleases() {
  const today = startOfDay(new Date());
  const thirtyDaysAgo = subDays(today, 30);

  const games = await prisma.game.findMany({
    where: {
      releaseDate: {
        gte: thirtyDaysAgo,
        lte: today,
      },
    },
    orderBy: {
      releaseDate: 'desc',
    },
    take: 10,
  });

  return games;
}

export async function getUpcomingGames() {
  const today = startOfDay(new Date());
  const sixtyDaysFromNow = addDays(today, 60);

  const games = await prisma.game.findMany({
    where: {
      releaseDate: {
        gt: today,
        lte: sixtyDaysFromNow,
      },
    },
    orderBy: {
      releaseDate: 'asc',
    },
    take: 10,
  });

  return games;
}

export async function getMostAnticipatedGames() {
  // 1. Aggregation on UserLibrary
  const mostAnticipated = await prisma.userLibrary.groupBy({
    by: ['gameId'],
    where: {
        status: 'WISHLIST',
    },
    _count: { gameId: true },
    orderBy: { _count: { gameId: 'desc' } },
    take: 10,
  });

  if (mostAnticipated.length >= 5) {
    const gameIds = mostAnticipated.map((item) => item.gameId);
    const games = await prisma.game.findMany({
      where: {
        id: {
          in: gameIds,
        },
      },
    });

    // Sort games based on the aggregation order
    return games.sort((a, b) => {
      const indexA = gameIds.indexOf(a.id);
      const indexB = gameIds.indexOf(b.id);
      return indexA - indexB;
    });
  }

  // Fallback: Highest igdbScore with future release date
  const today = startOfDay(new Date());
  const fallbackGames = await prisma.game.findMany({
    where: {
      releaseDate: {
        gt: today,
      },
      igdbScore: {
        not: null,
      },
    },
    orderBy: {
      igdbScore: 'desc',
    },
    take: 10,
  });

  return fallbackGames;
}
