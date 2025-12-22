'use server';

import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { Game } from '@prisma/client';

/**
 * Cached Data Fetcher for Discovery Sections
 * Revalidates every 12 hours.
 */
export const getCachedDiscoveryGames = unstable_cache(
  async (type: 'UPCOMING' | 'POPULAR' | 'RECENT' | 'TOP_RATED' | 'HYPED') => {
    console.log(`[Discovery] Fetching fresh data for ${type} from Local DB...`);

    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysFuture = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    try {
        switch (type) {
            case 'UPCOMING':
                return await prisma.game.findMany({
                    where: {
                        releaseDate: {
                            gt: now,
                            // extend to 6 months if 60 days is too strict, but strictly requested 60 days
                            lte: sixtyDaysFuture
                        }
                    },
                    orderBy: {
                        releaseDate: 'asc'
                    },
                    take: 10
                });

            case 'RECENT':
                return await prisma.game.findMany({
                    where: {
                        releaseDate: {
                            gte: thirtyDaysAgo,
                            lte: now
                        }
                    },
                    orderBy: {
                        releaseDate: 'desc'
                    },
                    take: 10
                });

            case 'TOP_RATED':
                return await prisma.game.findMany({
                    where: {
                        releaseDate: {
                            gte: startOfYear,
                            lte: now
                        },
                        opencriticScore: {
                            not: null
                        }
                    },
                    orderBy: {
                        opencriticScore: 'desc'
                    },
                    take: 50
                });

            case 'POPULAR':
            default:
                 // Fallback to generic highly rated games (all time)
                 return await prisma.game.findMany({
                    where: {
                         opencriticScore: {
                             gt: 80
                         }
                    },
                    orderBy: {
                        opencriticScore: 'desc'
                    },
                    take: 10
                 });
        }
    } catch (error) {
        console.error(`[Discovery] Error fetching ${type}:`, error);
        return [];
    }
  },
  ['discovery-games-local-v1'],
  {
    revalidate: 3600 * 12, // 12 hours cache
    tags: ['discovery']
  }
);

/**
 * Hybrid Fetcher: Local DB Anticipated
 */
export async function getMostAnticipatedGames() {
  try {
      // 1. Aggregation on UserLibrary (Local Interest)
      const mostAnticipated = await prisma.userLibrary.groupBy({
        by: ['gameId'],
        where: {
            status: 'WISHLIST',
        },
        _count: { gameId: true },
        orderBy: { _count: { gameId: 'desc' } },
        take: 10,
      });

      if (mostAnticipated.length > 0) {
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

      // 2. Fallback: Local games with high rating released in the future (or simply high rated if none)
      // Since we might not have upcoming games with ratings yet, we fallback to just high rated recent games
      // or games with release date in future (if any).

      const futureGames = await prisma.game.findMany({
          where: {
              releaseDate: {
                  gt: new Date()
              }
          },
          orderBy: {
             // If we had a hype score, we'd use it. releaseDate asc is reasonable for "anticipated" if no other metric.
             releaseDate: 'asc'
          },
          take: 10
      });

      if (futureGames.length > 0) return futureGames;

      // Final Fallback: just top rated games generally
      // If opencriticScore is missing for all games (unlikely), we fallback to releaseDate desc
      return await prisma.game.findMany({
           where: {
               OR: [
                   { opencriticScore: { not: null } },
                   { releaseDate: { not: null } }
               ]
           },
           orderBy: [
               { opencriticScore: 'desc' },
               { releaseDate: 'desc' }
           ],
           take: 10
      });

  } catch (error) {
      console.error("[Discovery] Error fetching anticipated games:", error);
      return [];
  }
}
