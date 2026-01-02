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
                                gt: now
                            }
                        },
                        orderBy: {
                            releaseDate: 'asc'
                        },
                        take: 50 // Fetch more for filtering
                    });
                    if (localGames.length < 5) {
                        const igdbGames = await getDiscoveryGamesIgdb('UPCOMING', 20); // Fetch a bit more from IGDB too
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
                        take: 50 // Fetch more for filtering
                    });
                    if (localGames.length < 5) {
                        const igdbGames = await getDiscoveryGamesIgdb('RECENT', 20);
                        return igdbGames.map(mapIgdbToPrismaGame);
                    }
                    return localGames;

                case 'TOP_RATED':
                    // Jan & Feb: Show Top Rated of PREVIOUS Year
                    // Mar -> Dec: Show Top Rated of CURRENT Year
                    let startOfRatingPeriod = startOfYear;
                    let endOfRatingPeriod = now;

                    if (now.getMonth() < 2) {
                        const prevYear = currentYear - 1;
                        startOfRatingPeriod = new Date(prevYear, 0, 1);
                        endOfRatingPeriod = new Date(prevYear, 11, 31, 23, 59, 59);
                        console.log(`[Discovery] Top Rated: Using Previous Year (${prevYear})`);
                    } else {
                        console.log(`[Discovery] Top Rated: Using Current Year (${currentYear})`);
                    }

                    // Increase the limit to 100 to ensure we have enough candidates for client-side platform filtering
                    localGames = await prisma.game.findMany({
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
                        take: 100
                    });

                    if (localGames.length < 5) {
                        const igdbGames = await getDiscoveryGamesIgdb('POPULAR', 10);
                        return igdbGames.map(mapIgdbToPrismaGame);
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
        // Fetches games with high hype from IGDB that are releasing in the future
        console.log("[Discovery] Not enough local anticipated data. Falling back to IGDB Hype...");
        const hypedGames = await getDiscoveryGamesIgdb('ANTICIPATED', 10);

        return hypedGames.map(mapIgdbToPrismaGame);

    } catch (error) {
        console.error("[Discovery] Error fetching anticipated games:", error);
        return [];
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
        storyline: igdbGame.storyline || null,
        status: igdbGame.status || null,
        gameType: igdbGame.game_type || igdbGame.category || null,
        relatedGames: null, // Since we don't have this in EnrichedIgdbGame in discovery usually, or we can map it if we did.
        imageStatus: 'OK',
        parentId: null
    };
}
