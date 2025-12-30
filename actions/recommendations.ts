'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
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
  const topGenres = preferences.genres.slice(0, 5); // Take top 5
  if (topGenres.length === 0) return null;

  const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const selectedGenreObj = topGenres[dayIndex % topGenres.length];
  const selectedGenre = selectedGenreObj.name;

  // 3. Prisma Query
  // Find 10 games containing this genre, not in user library.
  // Must satisfy ONE of:
  // - High OpenCritic Score (>= 80)
  // - High IGDB Score (>= 80) as proxy for popularity if pure popularity missing
  // - High Steam Review Count (>= 1000) proxy for user gallery/popularity
  // - (Optional) Check users relation count if possible? Not directly in where.

  // Note: "que beaucoup d'utilisateurs ont dans leur gallerie de jeux" (that many users have in their gallery)
  // Since we cannot filter by relation count in standard Prisma `where` easily without grouping,
  // we rely on Steam Review Count as a strong proxy for global popularity,
  // and IGDB Score/OpenCritic as quality metrics.

  const games = await prisma.game.findMany({
    where: {
      genres: {
        contains: selectedGenre,
      },
      users: {
        none: {
          userId: userId,
        },
      },
      OR: [
        { opencriticScore: { gte: 80 } },
        { igdbScore: { gte: 80 } },
        { steamReviewCount: { gte: 1000 } }
      ]
    },
    orderBy: {
      opencriticScore: 'desc',
    },
    take: 10,
  });

  return {
    games,
    reason: `Parce que vous aimez le genre ${selectedGenre}`,
  };
}
