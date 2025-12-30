'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

interface GenreScore {
  name: string;
  score: number;
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
  const preferences = {
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
