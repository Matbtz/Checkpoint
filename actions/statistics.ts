"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type GenreStat = {
  name: string;
  count: number;
  percentage: number;
};

export type PlatformStat = {
  name: string;
  count: number;
  percentage: number;
};

export type UserStatistics = {
  counts: {
    totalGames: number;
    steamImported: number;
    completed: number;
    playing: number;
    backlog: number;
    wishlist: number;
  };
  time: {
    totalMinutes: number;
    totalHours: number;
    totalDays: number;
  };
  statusDistribution: { name: string; value: number; fill: string }[];
  topPlayed: {
    id: string;
    title: string;
    image: string | null;
    minutes: number;
    hours: number;
  }[];
  genreDistribution: GenreStat[];
  platformDistribution: PlatformStat[];
};

export async function getUserStatistics(): Promise<UserStatistics> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const library = await prisma.userLibrary.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      game: true,
    },
  });

  // 1. Counts
  const totalGames = library.length;
  const steamImported = library.filter((entry) => entry.playtimeSteam > 0).length;

  const statusCounts = library.reduce((acc, entry) => {
    // Normalize status to UPPERCASE to ensure consistency (e.g. "Completed" -> "COMPLETED")
    const statusKey = entry.status.toUpperCase();
    acc[statusKey] = (acc[statusKey] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 2. Time
  let totalMinutes = 0;
  library.forEach((entry) => {
    // Priority to manual time if it exists (assuming manual overrides steam if present, or adds to it?
    // Logic: Usually manual is an override or additional.
    // Memory says: "Game progress is calculated as (Time Played / Estimated HLTB Time) * 100, prioritizing manual playtime over Steam playtime if available."
    // But for TOTAL time, usually we just sum what is "played".
    // If manual is set, use it. If not, use Steam.
    if (entry.playtimeManual !== null && entry.playtimeManual !== undefined) {
      totalMinutes += entry.playtimeManual;
    } else {
      totalMinutes += entry.playtimeSteam;
    }
  });

  // 3. Top Played
  const sortedByTime = [...library]
    .map((entry) => {
        const minutes = entry.playtimeManual ?? entry.playtimeSteam;
        return {
            id: entry.gameId,
            title: entry.game.title,
            image: entry.game.coverImage,
            minutes: minutes,
            hours: Math.round(minutes / 60),
        };
    })
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // 4. Genre Distribution
  const genreCounts: Record<string, number> = {};
  library.forEach((entry) => {
    if (entry.game.genres) {
      try {
        const genres = JSON.parse(entry.game.genres);
        if (Array.isArray(genres)) {
          genres.forEach((g: any) => {
            // Genre can be string or object {id, name, slug} depending on source (IGDB vs RAWG)
            // Usually it's an object with 'name'.
            let name = "";
            if (typeof g === "string") name = g;
            else if (typeof g === "object" && g.name) name = g.name;

            if (name) {
              genreCounts[name] = (genreCounts[name] || 0) + 1;
            }
          });
        }
      } catch (e) {
        // ignore parse error
      }
    }
  });

  const sortedGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / totalGames) * 100),
    }));

  // 5. Platform Distribution
  const platformCounts: Record<string, number> = {};
  library.forEach((entry) => {
    if (entry.game.platforms) {
      try {
        const platforms = JSON.parse(entry.game.platforms);
        if (Array.isArray(platforms)) {
            platforms.forEach((p: any) => {
                let name = "";
                if (typeof p === "string") name = p;
                else if (typeof p === "object" && p.name) name = p.name; // IGDB structure often

                if (name) {
                    platformCounts[name] = (platformCounts[name] || 0) + 1;
                }
            })
        }
      } catch (e) {
        // ignore
      }
    }
  });

  const sortedPlatforms = Object.entries(platformCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8) // Top 8
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / totalGames) * 100),
    }));

  // Helper for status colors
  const getStatusColor = (status: string) => {
    const normalized = status.toUpperCase();
    switch (normalized) {
      case "COMPLETED": return "#22c55e"; // green-500
      case "PLAYING": return "#3b82f6"; // blue-500
      case "BACKLOG": return "#eab308"; // yellow-500
      case "ABANDONED": return "#ef4444"; // red-500
      case "WISHLIST": return "#a855f7"; // purple-500
      default: return "#71717a"; // zinc-500
    }
  };

  const statusDistribution = Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    fill: getStatusColor(name),
  }));

  return {
    counts: {
      totalGames,
      steamImported,
      completed: statusCounts["COMPLETED"] || 0,
      playing: statusCounts["PLAYING"] || 0,
      backlog: statusCounts["BACKLOG"] || 0,
      wishlist: statusCounts["WISHLIST"] || 0,
    },
    time: {
      totalMinutes,
      totalHours: Math.round(totalMinutes / 60),
      totalDays: Math.round(totalMinutes / 60 / 24),
    },
    statusDistribution,
    topPlayed: sortedByTime,
    genreDistribution: sortedGenres,
    platformDistribution: sortedPlatforms,
  };
}
