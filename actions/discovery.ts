'use server';

import { prisma } from '@/lib/db';
import { unstable_cache } from 'next/cache';
import { getDiscoveryGamesIgdb, EnrichedIgdbGame } from '@/lib/igdb';
import { Game } from '@prisma/client';

// -- Helpers --

/**
 * Maps IGDB data to a mock Prisma Game object for UI compatibility
 */
function mapIgdbToPrismaGame(igdbGame: EnrichedIgdbGame): Game {
    const releaseDate = igdbGame.first_release_date
        ? new Date(igdbGame.first_release_date * 1000)
        : null;

    // We mock the Game object.
    // ID is prefixed to avoid collision with real UUIDs, though UI handles string IDs fine.
    // We explicitly cast to any to bypass strict Prisma type requirements for missing fields
    // that are not used in the Discovery UI.
    return {
        id: `igdb-${igdbGame.id}`,
        title: igdbGame.name,
        coverImage: igdbGame.possibleCovers[0] || null,
        backgroundImage: igdbGame.possibleBackgrounds[0] || null,
        description: igdbGame.summary || '',
        releaseDate: releaseDate,
        opencriticScore: igdbGame.total_rating ? Math.round(igdbGame.total_rating) : null,
        studio: igdbGame.involved_companies?.find(c => c.developer)?.company.name || null,

        // Mocking required fields
        igdbId: igdbGame.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        genres: JSON.stringify(igdbGame.genres || []),
        platforms: igdbGame.platforms || [], // Direct Json usage

        // Nullable fields
        steamAppId: null,
        steamUrl: null,
        opencriticUrl: null,
        igdbUrl: igdbGame.url || null,
        hltbUrl: null,
        hltbMain: null,
        hltbExtra: null,
        hltbCompletionist: null,
        igdbScore: igdbGame.aggregated_rating ? Math.round(igdbGame.aggregated_rating) : null,
        steamReviewScore: null,
        steamReviewCount: null,
        steamReviewPercent: null,
        isDlc: false,
        primaryColor: null,
        secondaryColor: null,
    } as unknown as Game;
}

// -- Cached Actions --

/**
 * Cached Data Fetcher for Discovery Sections
 * Revalidates every 24 hours (86400s) or 12 hours depending on logic usage.
 */
export const getCachedDiscoveryGames = unstable_cache(
  async (type: 'UPCOMING' | 'POPULAR' | 'RECENT' | 'TOP_RATED' | 'HYPED') => {
    console.log(`[Discovery] Fetching fresh data for ${type} from IGDB...`);
    const games = await getDiscoveryGamesIgdb(type, type === 'TOP_RATED' ? 50 : 10);
    return games.map(mapIgdbToPrismaGame);
  },
  ['discovery-games-igdb-v1'],
  {
    revalidate: 3600 * 12, // 12 hours cache
    tags: ['discovery']
  }
);

/**
 * Hybrid Fetcher: Local DB first, fallback to Cached IGDB
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

      // If we have substantial local data (e.g., at least 5 anticipated games)
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

      // 2. Fallback: IGDB Hypes (Global Interest)
      // We use the cached action for this to avoid hitting API limit
      return await getCachedDiscoveryGames('HYPED');

  } catch (error) {
      console.error("[Discovery] Error fetching anticipated games:", error);
      return [];
  }
}
