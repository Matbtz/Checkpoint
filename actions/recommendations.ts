'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { Game } from '@prisma/client';

interface GenreScore {
  name: string;
  score: number;
}

interface UserPreferences {
  genres: GenreScore[];
  lastUpdated: string | Date; // Can be string from JSON.parse or Date object
}

interface DailyRecommendation {
  games: Game[];
  reason: string;
}

export async function refreshUserPreferences() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userId = session.user.id;

  // Fetch user library with game details (genres)
  const library = await prisma.userLibrary.findMany({
    where: { userId },
    include: {
      game: {
        select: {
          genres: true,
        },
      },
    },
  });

  const genreScores: Record<string, number> = {};

  for (const entry of library) {
    // 1. Calculate Playtime (Hours)
    let playtimeMinutes = entry.playtimeManual ?? entry.playtimeSteam ?? 0;
    let playtimeHours = playtimeMinutes / 60;

    // Cap at 250 hours
    if (playtimeHours > 250) {
      playtimeHours = 250;
    }

    // 2. Determine Multiplier
    let multiplier = 0.5;
    const status = entry.status.toUpperCase(); // Normalize status just in case

    if (status === 'COMPLETED') {
      multiplier = 1.5;
    } else if (status === 'PLAYING') {
      multiplier = 1.0;
    } else if (status === 'BACKLOG') {
      multiplier = 0.2;
    } else if (status === 'DROPPED' || status === 'ABANDONED') {
      multiplier = -0.5;
    }

    // 3. Calculate Score
    const score = playtimeHours * multiplier;

    // 4. Aggregate Scores by Genre
    if (entry.game.genres) {
      try {
        const genres = JSON.parse(entry.game.genres);
        if (Array.isArray(genres)) {
          for (const genre of genres) {
            let genreName: string | null = null;
            // Handle both string arrays and object arrays { name: "Genre" }
            if (typeof genre === 'string') {
              genreName = genre;
            } else if (typeof genre === 'object' && genre !== null && 'name' in genre) {
              genreName = (genre as any).name;
            }

            if (genreName) {
              if (!genreScores[genreName]) {
                genreScores[genreName] = 0;
              }
              genreScores[genreName] += score;
            }
          }
        }
      } catch (e) {
        console.error(`Failed to parse genres for game ${entry.gameId}`, e);
      }
    }
  }

  // 5. Convert to array and sort
  const sortedGenres: GenreScore[] = Object.entries(genreScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  // 6. Save to User preferences
  const preferences: UserPreferences = {
    genres: sortedGenres,
    lastUpdated: new Date(),
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferences: JSON.stringify(preferences),
    },
  });

  return preferences;
}

export async function getDailyRecommendations(): Promise<DailyRecommendation | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userId = session.user.id;

  // 1. Fetch User Preferences
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });

  let preferences: UserPreferences | null = null;

  if (user?.preferences) {
    try {
      preferences = JSON.parse(user.preferences);
    } catch (e) {
      console.error("Failed to parse user preferences", e);
    }
  }

  // Check if refresh is needed
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let shouldRefresh = false;
  if (!preferences || !preferences.genres || preferences.genres.length === 0) {
    shouldRefresh = true;
  } else {
    const lastUpdated = new Date(preferences.lastUpdated);
    if (isNaN(lastUpdated.getTime()) || lastUpdated < oneDayAgo) {
      shouldRefresh = true;
    }
  }

  if (shouldRefresh) {
    preferences = await refreshUserPreferences();
  }

  // Ensure we have preferences now
  if (!preferences || !preferences.genres || preferences.genres.length === 0) {
    return null; // Or return empty state
  }

  // 2. Deterministic Rotation
  const topGenres = preferences.genres.slice(0, 10); // Take top 10 for more variety
  if (topGenres.length === 0) return null;

  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const selectedGenreObj = topGenres[dayIndex % topGenres.length];
  const selectedGenre = selectedGenreObj.name;

  // 3. Primary Strategy: Average of OpenCritic + Steam Review Percent
  // We fetch a pool of candidates (top 50 by OpenCritic) to sort in memory
  let games = await prisma.game.findMany({
    where: {
      genres: {
        contains: selectedGenre,
      },
      users: {
        none: {
          userId: userId,
        },
      },
      opencriticScore: { not: null },
      steamReviewPercent: { not: null },
    },
    orderBy: {
      opencriticScore: 'desc',
    },
    take: 50,
  });

  if (games.length > 0) {
    // Sort by average score
    games.sort((a, b) => {
      const scoreA = ((a.opencriticScore ?? 0) + (a.steamReviewPercent ?? 0)) / 2;
      const scoreB = ((b.opencriticScore ?? 0) + (b.steamReviewPercent ?? 0)) / 2;
      return scoreB - scoreA;
    });

    // Return top 10
    return {
      games: games.slice(0, 10),
      reason: `Recommandé pour vous (Genre : ${selectedGenre})`,
    };
  }

  // 4. Fallback Strategy: IGDB Score
  // Exclude games with "Mixed" or worse Steam reviews if Steam data is present (Steam Review Percent < 70)
  games = await prisma.game.findMany({
    where: {
      genres: {
        contains: selectedGenre,
      },
      users: {
        none: {
          userId: userId,
        },
      },
      igdbScore: { not: null },
      OR: [
        { steamReviewPercent: { gte: 70 } },
        { steamReviewPercent: null }
      ]
    },
    orderBy: {
      igdbScore: 'desc',
    },
    take: 10,
  });

  if (games.length > 0) {
    return {
      games,
      reason: `Recommandé pour vous (Genre : ${selectedGenre})`,
    };
  }

  return null;
}
