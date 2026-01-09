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

export type YearStat = {
  year: number;
  count: number;
};

export type ScoreStat = {
  title: string;
  score: number; // Metacritic or IGDB
  hours: number;
  image: string | null;
};

export type CommunityStat = {
  percentile: number; // 0-100
  value: number; // The value at this percentile
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
    averageScore: number;
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
  releaseYearDistribution: YearStat[];
  scoreVsPlaytime: ScoreStat[];
  marketGap: {
    gamesOwned: { percentiles: CommunityStat[]; userValue: number; userPercentile: number };
    gamesFinished: { percentiles: CommunityStat[]; userValue: number; userPercentile: number };
    hoursPlayed: { percentiles: CommunityStat[]; userValue: number; userPercentile: number };
  };
};

export async function getUserStatistics(): Promise<UserStatistics> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  const library = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
    },
    include: {
      game: true,
    },
  });

  // --- 1. Basic Counts & Time ---
  const totalGames = library.length;
  const steamImported = library.filter((entry) => entry.playtimeSteam > 0).length;

  const statusCounts = library.reduce((acc, entry) => {
    const statusKey = entry.status.toUpperCase();
    acc[statusKey] = (acc[statusKey] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let totalMinutes = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  library.forEach((entry) => {
    // Time logic
    const minutes = entry.playtimeManual ?? entry.playtimeSteam ?? 0;
    totalMinutes += minutes;

    // Avg Score logic (using IGDB or Metacritic)
    const score = entry.game.igdbScore ?? entry.game.opencriticScore;
    if (score) {
      scoreSum += score;
      scoreCount++;
    }
  });

  const averageScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0;

  // --- 2. Distributions (Genres, Platforms, Years, Scatter) ---

  const genreCounts: Record<string, number> = {};
  const platformCounts: Record<string, number> = {};
  const yearCounts: Record<number, number> = {};
  const scoreData: ScoreStat[] = [];

  library.forEach((entry) => {
    // Genres
    if (entry.game.genres) {
      try {
        const genres = JSON.parse(entry.game.genres);
        if (Array.isArray(genres)) {
          genres.forEach((g: any) => {
            let name = typeof g === "string" ? g : g?.name;
            if (name) genreCounts[name] = (genreCounts[name] || 0) + 1;
          });
        }
      } catch { }
    }

    // Platforms (STRICTLY OWNED)
    // iterate ownedPlatforms array
    if (entry.ownedPlatforms && Array.isArray(entry.ownedPlatforms)) {
      entry.ownedPlatforms.forEach(p => {
        platformCounts[p] = (platformCounts[p] || 0) + 1;
      });
    }

    // Release Year
    if (entry.game.releaseDate) {
      const y = new Date(entry.game.releaseDate).getFullYear();
      if (!isNaN(y)) {
        yearCounts[y] = (yearCounts[y] || 0) + 1;
      }
    }

    // Scatter Data
    const minutes = entry.playtimeManual ?? entry.playtimeSteam ?? 0;
    const score = entry.game.igdbScore ?? entry.game.opencriticScore;
    if (score && minutes > 60) { // Only plot games played > 1 hour
      scoreData.push({
        title: entry.game.title,
        score: score,
        hours: Math.round(minutes / 60 * 10) / 10,
        image: entry.game.coverImage
      });
    }
  });

  // Sort & Transform Distributions
  const sortedGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / totalGames) * 100),
    }));

  const sortedPlatforms = Object.entries(platformCounts)
    .sort(([, a], [, b]) => b - a)
    // .slice(0, 10) // Maybe don't slice platforms, or slice top 10
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / totalGames) * 100),
    })).sort((a, b) => b.count - a.count);

  const releaseYearDistribution = Object.entries(yearCounts)
    .map(([year, count]) => ({ year: parseInt(year), count }))
    .sort((a, b) => a.year - b.year); // Chronological

  // --- 3. Top Played ---
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

  // --- 4. Status Colors ---
  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "#22c55e";
      case "PLAYING": return "#3b82f6";
      case "BACKLOG": return "#eab308";
      case "ABANDONED": return "#ef4444";
      case "WISHLIST": return "#a855f7";
      default: return "#71717a";
    }
  };
  const ORDERED_STATUSES = ["BACKLOG", "PLAYING", "COMPLETED", "ABANDONED", "WISHLIST"];
  const statusDistribution = ORDERED_STATUSES.map(status => ({
    name: status,
    value: statusCounts[status] || 0,
    fill: getStatusColor(status)
  })).filter(item => item.value > 0);

  // --- 5. Community Benchmarking ---
  // Fetch ALL users summary for benchmarking
  // WARNING: This aggregation might get heavy for massive DBs, but for <10k users it's fine.
  // We need distinct user stats.
  const allUserStats = await prisma.userLibrary.groupBy({
    by: ['userId'],
    _count: {
      gameId: true, // Total Games
      _all: true
    },
    _sum: {
      playtimeSteam: true, // We can't easily sum 'manual OR steam' in prisma groupBy.
      playtimeManual: true, // We'll sum both and handle logic roughly, or use raw query.
      // Rough approx for community stats: Sum(playtimeSteam) + Sum(playtimeManual) is risky if they duplicate.
      // Better: We just use simple metrics for now or raw query for exactness.
      // Let's use Sum(playtimeSteam) for simplicity as "Community Hours" proxy, or just fetch all and process in memory?
      // Fetching all is too heavy.
      // Let's rely on `playtimeSteam` as the primary metric for community comparison to avoid complexity,
      // OR if most users use manual, we miss out.
      // Compromise: We will sum `playtimeSteam`.
    },
  });

  // We also need "Completed" count per user.
  // groupBy userId where status=COMPLETED
  const completedStats = await prisma.userLibrary.groupBy({
    by: ['userId'],
    where: { status: 'COMPLETED' },
    _count: { gameId: true }
  });

  const completedMap = new Map<string, number>();
  completedStats.forEach(s => completedMap.set(s.userId, s._count.gameId));

  // Build the dataset for percentiles
  const communityData = allUserStats.map(s => {
    return {
      userId: s.userId,
      gamesOwned: s._count.gameId,
      // Roughly Estimate hours: Steam hours.
      hoursPlayed: Math.round((s._sum.playtimeSteam || 0) / 60),
      gamesFinished: completedMap.get(s.userId) || 0
    };
  });

  // Helper to get percentiles curve and user rank
  const calculateMarketGap = (data: number[], userVal: number) => {
    const sorted = data.sort((a, b) => a - b);
    // Generate 100 percentile points
    const percentiles: CommunityStat[] = [];
    for (let i = 0; i <= 100; i += 10) { // Every 10% step for smoother graph, or 5%
      const idx = Math.min(Math.floor((i / 100) * (sorted.length - 1)), sorted.length - 1);
      percentiles.push({ percentile: i, value: sorted[idx] });
    }

    // Find user percentile
    const rank = sorted.filter(v => v < userVal).length;
    const userPercentile = Math.round((rank / sorted.length) * 100);

    return { percentiles, userValue: userVal, userPercentile };
  };

  const marketGap = {
    gamesOwned: calculateMarketGap(communityData.map(d => d.gamesOwned), totalGames),
    gamesFinished: calculateMarketGap(communityData.map(d => d.gamesFinished), statusCounts["COMPLETED"] || 0),
    hoursPlayed: calculateMarketGap(communityData.map(d => d.hoursPlayed), Math.round(totalMinutes / 60)),
  };

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
      averageScore
    },
    statusDistribution,
    topPlayed: sortedByTime,
    genreDistribution: sortedGenres,
    platformDistribution: sortedPlatforms,
    releaseYearDistribution,
    scoreVsPlaytime: scoreData,
    marketGap
  };
}

