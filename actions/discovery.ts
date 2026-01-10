'use server';

import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { Game } from '@prisma/client';
import { getDiscoveryGamesIgdb, EnrichedIgdbGame } from '@/lib/igdb';
import { randomUUID } from 'crypto';
import { findFallbackMetadata } from '@/lib/enrichment';

/**
 * Cached Data Fetcher for Discovery Sections
 * Revalidates every 12 hours.
 */
export const getCachedDiscoveryGames = unstable_cache(
    async (type: 'UPCOMING' | 'POPULAR' | 'RECENT' | 'TOP_RATED' | 'HYPED' | 'RECENTLY_REVIEWED') => {
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
                        console.log(`[Discovery] UPCOMING: Local too low (${localGames.length}), fetching from IGDB`);
                        const igdbGames = await getDiscoveryGamesIgdb('UPCOMING', 20); // Fetch a bit more from IGDB too
                        return upsertDiscoveryGames(igdbGames);
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

                    return localGames;

                case 'RECENTLY_REVIEWED':
                    // Games with recent score updates (any score), ordered by update date
                    localGames = await prisma.game.findMany({
                        where: {
                            opencriticScoreUpdatedAt: {
                                not: null
                            }
                        },
                        orderBy: {
                            opencriticScoreUpdatedAt: 'desc'
                        },
                        take: 20
                    });

                    // No fallback for this specific filtered view as it depends on scores
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
                        console.log(`[Discovery] POPULAR: Local localGames too low (${localGames.length}), fetching from IGDB`);
                        const igdbGames = await getDiscoveryGamesIgdb('POPULAR', 10);
                        return upsertDiscoveryGames(igdbGames);
                    }
                    return localGames;
            }
        } catch (error) {
            console.error(`[Discovery] Error fetching ${type}:`, error);
            return [];
        }
    },
    ['discovery-games-local-v7'],
    {
        revalidate: 86400, // 24 hours cache
        tags: ['discovery']
    }
);

/**
 * Hybrid Fetcher: Local DB Anticipated
 */
export const getMostAnticipatedGames = unstable_cache(
    async () => {
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

            return upsertDiscoveryGames(hypedGames);

        } catch (error) {
            console.error("[Discovery] Error fetching anticipated games:", error);
            return [];
        }
    },
    ['most-anticipated-games'],
    {
        revalidate: 86400, // 24 hours cache
        tags: ['discovery', 'anticipated']
    }
);

/**
 * Batch upsert games from IGDB into the database.
 * Returns the saved games with persistent IDs.
 */
async function upsertDiscoveryGames(igdbGames: EnrichedIgdbGame[]): Promise<Game[]> {
    console.log(`[Discovery] Upserting ${igdbGames.length} games from IGDB`);
    if (igdbGames.length === 0) return [];

    // Process games in parallel to allow concurrent fetching of fallback data
    const upsertPromises = igdbGames.map(async (game) => {
        const releaseDate = game.first_release_date ? new Date(game.first_release_date * 1000) : null;
        let description = game.summary || '';
        let coverImage = game.possibleCovers?.[0] || null;
        let backgroundImage = game.possibleBackgrounds?.[0] || null;

        // Fallback Enrichment: If description is missing, try to fetch from Steam
        if (!description) {
            try {
                console.log(`[Discovery] Missing description for ${game.name}, attempting Steam fallback...`);
                // Use release year to help matching
                const year = releaseDate ? releaseDate.getFullYear() : null;
                const fallback = await findFallbackMetadata(game.name, year);

                if (fallback) {
                    if (fallback.description) {
                        description = fallback.description;
                        console.log(`[Discovery] Found description for ${game.name} from Steam.`);
                    }
                    // Also enrich screenshots/background if missing
                    if (!backgroundImage && fallback.screenshots && fallback.screenshots.length > 0) {
                        backgroundImage = fallback.screenshots[0];
                    }
                } else {
                    console.log(`[Discovery] No fallback description found for ${game.name}.`);
                }
            } catch (err) {
                console.error(`[Discovery] Fallback enrichment failed for ${game.name}:`, err);
            }
        }

        try {
            return await prisma.game.upsert({
                where: { igdbId: game.id.toString() },
                update: {
                    igdbScore: Math.round(game.aggregated_rating || game.total_rating || 0),
                    hypes: game.hypes || null,
                    status: game.status || null,
                    // Force update images if new high-res ones are found
                    coverImage: coverImage || undefined,
                    backgroundImage: backgroundImage || undefined,
                    // For now, update only transient fields to avoid overwriting custom data,
                    // BUT if the DB has empty description, we might want to fill it.
                    // Doing a conditional update in Prisma is hard in one query.
                    // We'll stick to 'update' only updating scores/status for existing games as per strict persistence rules,
                    // UNLESS we want to backfill. 
                    // Let's assume on 'update', if we really want to simple-fix, we trust the DB already has data if it exists.
                    // If the user complains about "no info", it's likely a NEW game being inserted or one that was inserted empty.
                    // If it was inserted empty, we might want to update description if the new one is present.
                    // Let's safe-guard: only update description if it's currently empty in DB? No, that requires a read.
                    // We will just leave update as is for performance, focusing on CREATE for now which is the main issue for new discovery games.
                },
                create: {
                    id: randomUUID(),
                    igdbId: game.id.toString(),
                    title: game.name,
                    coverImage: coverImage,
                    backgroundImage: backgroundImage,
                    releaseDate: releaseDate,
                    description: description, // Enriched description
                    igdbScore: Math.round(game.aggregated_rating || game.total_rating || 0),
                    studio: game.involved_companies?.[0]?.company?.name || null,
                    platforms: game.platforms ? game.platforms.map(p => ({ name: p.name })) as any : null,
                    genres: game.genres ? JSON.stringify(game.genres.map(g => g.name)) : null,
                    igdbUrl: game.url || null,
                    hypes: game.hypes || null,
                    status: game.status || null,
                    gameType: game.game_type || game.category || null,
                    storyline: game.storyline || null,

                    // Defaults
                    imageStatus: 'OK',
                    isDlc: false,
                    dataMissing: false,
                    dataFetched: false,
                    updatedAt: new Date(),
                }
            });
        } catch (error) {
            console.error(`[Discovery] Failed to upsert game ${game.name} (${game.id}):`, error);
            return null;
        }
    });

    const results = await Promise.all(upsertPromises);
    return results.filter(g => g !== null) as Game[];
}
