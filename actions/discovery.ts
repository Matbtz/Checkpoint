'use server';

import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { Game } from '@prisma/client';
import { getDiscoveryGamesIgdb, EnrichedIgdbGame } from '@/lib/igdb';

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
        let localGames: Game[] = [];

        switch (type) {
            case 'UPCOMING':
                localGames = await prisma.game.findMany({
                    where: {
                        releaseDate: {
                            gt: now,
                            lte: sixtyDaysFuture
                        }
                    },
                    orderBy: {
                        releaseDate: 'asc'
                    },
                    take: 10
                });
                if (localGames.length < 5) {
                    const igdbGames = await getDiscoveryGamesIgdb('UPCOMING', 10);
                    return igdbGames.map(mapIgdbToPrismaGame);
                }
                return localGames;

            case 'RECENT':
                localGames = await prisma.game.findMany({
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

                if (localGames.length < 5) {
                    const igdbGames = await getDiscoveryGamesIgdb('RECENT', 10);
                    // Merge local and remote, preferring local
                    const mappedIgdb = igdbGames.map(mapIgdbToPrismaGame);
                    // Filter duplicates by checking title or igdbId?
                    // Simple approach: just return mixed list if local is very small
                    if (localGames.length === 0) return mappedIgdb;
                    return [...localGames, ...mappedIgdb].slice(0, 10);
                }
                return localGames;

            case 'TOP_RATED':
                // 1. Try Local with OpenCritic Score
                localGames = await prisma.game.findMany({
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

                // 2. Try Local with IGDB Score (Fallback if OpenCritic is missing)
                if (localGames.length < 5) {
                    const localIgdbRated = await prisma.game.findMany({
                         where: {
                            releaseDate: {
                                gte: startOfYear,
                                lte: now
                            },
                            igdbScore: {
                                gt: 80
                            }
                        },
                        orderBy: {
                            igdbScore: 'desc'
                        },
                        take: 10
                    });

                    // Deduplicate and merge
                    const existingIds = new Set(localGames.map(g => g.id));
                    for (const game of localIgdbRated) {
                        if (!existingIds.has(game.id)) {
                            localGames.push(game);
                            existingIds.add(game.id);
                        }
                    }
                }

                // 3. Fallback to External IGDB Popular
                if (localGames.length < 5) {
                     const igdbGames = await getDiscoveryGamesIgdb('POPULAR', 10);
                     const mappedIgdb = igdbGames.map(mapIgdbToPrismaGame);
                     return [...localGames, ...mappedIgdb].slice(0, 10);
                }
                return localGames;

            case 'POPULAR':
            default:
                 localGames = await prisma.game.findMany({
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
                 if (localGames.length < 5) {
                     const igdbGames = await getDiscoveryGamesIgdb('POPULAR', 10);
                     return igdbGames.map(mapIgdbToPrismaGame);
                 }
                 return localGames;
        }
    } catch (error) {
        console.error(`[Discovery] Error fetching ${type}:`, error);
        return [];
    }
  },
  ['discovery-games-local-v2'],
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
      const now = new Date();

      // 1. Aggregation on UserLibrary (Local Interest)
      // Prisma doesn't allow relation filters in groupBy, so we fetch all wishlisted games first
      const mostAnticipated = await prisma.userLibrary.groupBy({
        by: ['gameId'],
        where: {
            status: 'WISHLIST',
        },
        _count: { gameId: true },
        orderBy: { _count: { gameId: 'desc' } },
        take: 20, // Take more to account for date filtering
      });

      if (mostAnticipated.length > 0) {
        const gameIds = mostAnticipated.map((item) => item.gameId);

        // Filter by Future Release Date
        const games = await prisma.game.findMany({
          where: {
            id: {
              in: gameIds,
            },
            releaseDate: {
                gt: now
            }
          },
        });

        // If we have enough local data (arbitrary threshold of 5), use it
        if (games.length >= 5) {
             // Sort games based on the aggregation order
            return games.sort((a, b) => {
                const indexA = gameIds.indexOf(a.id);
                const indexB = gameIds.indexOf(b.id);
                return indexA - indexB;
            });
        }

      }

      // 2. Fallback: IGDB Hype System (External)
      console.log("[Discovery] Not enough local anticipated data. Falling back to IGDB Hype...");
      const hypedGames = await getDiscoveryGamesIgdb('ANTICIPATED', 10);
      const mappedIgdb = hypedGames.map(mapIgdbToPrismaGame);

      // 3. Merge Local (if available) and External
      let finalGames: Game[] = [];

      // If we had some local games but fewer than 5, we need to re-fetch or use them.
      // Since `games` is scoped inside the block above, we can't access it here easily without refactoring.
      // Given the complexity of merging scoped variables, we will prioritize External results if Local < 5.
      // However, if we found ANY local games, we should probably include them.

      if (mostAnticipated.length > 0) {
          const gameIds = mostAnticipated.map((item) => item.gameId);
          const localGames = await prisma.game.findMany({
            where: {
                id: { in: gameIds },
                releaseDate: { gt: now }
            }
          });

          finalGames = [...localGames];
      }

      // Append external games ensuring no duplicates
      const existingIds = new Set(finalGames.map(g => g.igdbId)); // Use igdbId for deduplication

      for (const game of mappedIgdb) {
          if (!existingIds.has(game.igdbId)) {
              finalGames.push(game);
              existingIds.add(game.igdbId);
          }
          if (finalGames.length >= 10) break;
      }

      return finalGames.length > 0 ? finalGames : mappedIgdb;

  } catch (error) {
      console.error("[Discovery] Error fetching anticipated games:", error);
      // Attempt critical fallback to IGDB directly if local DB failed
      try {
          const hypedGames = await getDiscoveryGamesIgdb('ANTICIPATED', 10);
          return hypedGames.map(mapIgdbToPrismaGame);
      } catch (innerError) {
          console.error("[Discovery] Critical fallback failed:", innerError);
          return [];
      }
  }
}

/**
 * Mapper helper to transform IGDB data to Transient Prisma Game Object
 */
function mapIgdbToPrismaGame(igdbGame: EnrichedIgdbGame): Game {
    return {
        id: `igdb-${igdbGame.id}`, // Temporary ID
        igdbId: igdbGame.id.toString(),
        title: igdbGame.name,
        coverImage: igdbGame.possibleCovers?.[0] || null,
        backgroundImage: igdbGame.possibleBackgrounds?.[0] || null,
        releaseDate: igdbGame.first_release_date ? new Date(igdbGame.first_release_date * 1000) : null,
        description: igdbGame.summary || '',
        igdbScore: Math.round(igdbGame.aggregated_rating || igdbGame.total_rating || 0),
        opencriticScore: null,
        // Default empty/null for required fields
        updatedAt: new Date(),
        steamAppId: null,
        steamReviewScore: null,
        steamReviewCount: null,
        steamReviewPercent: null,
        isDlc: false,
        studio: igdbGame.involved_companies?.[0]?.company?.name || null,
        platforms: igdbGame.platforms ? JSON.stringify(igdbGame.platforms.map(p => ({ name: p.name }))) : null,
        genres: igdbGame.genres ? JSON.stringify(igdbGame.genres.map(g => g.name)) : null,
        steamUrl: null,
        opencriticUrl: null,
        igdbUrl: igdbGame.url || null,
        hltbUrl: null,
        hltbMain: null,
        hltbExtra: null,
        hltbCompletionist: null,
        primaryColor: null,
        secondaryColor: null,
        igdbTime: null,
        dataMissing: false,
        dataFetched: false,
        videos: [],
        screenshots: [],
    };
}
