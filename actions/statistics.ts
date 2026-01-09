"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type MetricStat = {
  name: string;
  owned: number;
  playtime: number; // in hours
  completed: number;
  abandoned: number;
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

export type ScoreDistribution = {
    scoreRange: string;
    count: number;
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
  genreStats: MetricStat[];
  platformStats: MetricStat[];
  franchiseStats: MetricStat[];
  releaseYearDistribution: YearStat[];
  scoreVsPlaytime: ScoreStat[];
  scoreDistribution: ScoreDistribution[];
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

  // 1. Fetch Library
  const library = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
    },
    include: {
      game: {
        include: {
           // We need parent info to aggregate DLCs
           parent: {
             select: {
               id: true,
               title: true,
             }
           }
        }
      },
    },
  });

  // --- Helper to normalize Playtime ---
  const getPlaytime = (entry: any) => entry.playtimeManual ?? entry.playtimeSteam ?? 0;
  const getScore = (entry: any) => entry.game.igdbScore ?? entry.game.opencriticScore;

  // --- Aggregation Maps ---
  const statusCounts: Record<string, number> = {};
  let totalMinutes = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  // Data for MetricStat
  type StatAccumulator = { owned: number; playtime: number; completed: number; abandoned: number };
  const genreAcc: Record<string, StatAccumulator> = {};
  const platformAcc: Record<string, StatAccumulator> = {};
  const franchiseAcc: Record<string, StatAccumulator> = {};

  const yearCounts: Record<number, number> = {};
  const scoreData: ScoreStat[] = []; // For Scatter Plot
  const scoreBuckets: Record<string, number> = {}; // For Bar Chart (Completed Games)

  // Initialize score buckets 0-100
  for (let i = 0; i < 100; i += 10) {
    const label = `${i}-${i + 9}`;
    scoreBuckets[label] = 0;
  }

  // Top Played Preparation (Map gameId -> merged data)
  const gameMap = new Map<string, {
    title: string;
    image: string | null;
    minutes: number;
    isDlc: boolean;
    parentId: string | null;
  }>();

  // Helper to init accumulator
  const initAcc = (record: Record<string, StatAccumulator>, key: string) => {
    if (!record[key]) {
      record[key] = { owned: 0, playtime: 0, completed: 0, abandoned: 0 };
    }
  };

  // --- Main Loop ---
  for (const entry of library) {
    const minutes = getPlaytime(entry);
    const status = entry.status.toUpperCase();
    const score = getScore(entry);

    // Status Counts
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    // Total Time
    totalMinutes += minutes;

    // Avg Score
    if (score) {
      scoreSum += score;
      scoreCount++;
    }

    // Top Played Aggregation Logic
    // Store raw data first
    gameMap.set(entry.gameId, {
      title: entry.game.title,
      image: entry.game.coverImage,
      minutes: minutes,
      isDlc: entry.game.isDlc,
      parentId: entry.game.parentId,
    });

    // --- Metric Aggregations ---
    const hours = minutes / 60;
    const isCompleted = status === "COMPLETED";
    const isAbandoned = status === "ABANDONED";

    // 1. Genres
    if (entry.game.genres) {
      try {
        const genres = JSON.parse(entry.game.genres);
        if (Array.isArray(genres)) {
          genres.forEach((g: any) => {
            const name = typeof g === "string" ? g : g?.name;
            if (name) {
              initAcc(genreAcc, name);
              genreAcc[name].owned++;
              genreAcc[name].playtime += hours;
              if (isCompleted) genreAcc[name].completed++;
              if (isAbandoned) genreAcc[name].abandoned++;
            }
          });
        }
      } catch {}
    }

    // 2. Platforms (Owned)
    if (entry.ownedPlatforms && Array.isArray(entry.ownedPlatforms)) {
        entry.ownedPlatforms.forEach(p => {
             initAcc(platformAcc, p);
             platformAcc[p].owned++;
             // Playtime per platform is tricky as we store total playtime.
             // We will attribute FULL playtime to ALL owned platforms for now (imperfect but simple)
             // OR divide it? Attributing full is misleading if owned on 3 platforms.
             // But usually people play on one. Let's attribute FULL for now as per requirement "Playtime by platform"
             // Assuming if you own it on Switch, you played it on Switch.
             platformAcc[p].playtime += hours;
             if (isCompleted) platformAcc[p].completed++;
             if (isAbandoned) platformAcc[p].abandoned++;
        });
    }

    // 3. Franchises
    if (entry.game.franchise) {
        const f = entry.game.franchise;
        initAcc(franchiseAcc, f);
        franchiseAcc[f].owned++;
        franchiseAcc[f].playtime += hours;
        if (isCompleted) franchiseAcc[f].completed++;
        if (isAbandoned) franchiseAcc[f].abandoned++;
    }

    // 4. Release Year
    if (entry.game.releaseDate) {
      const y = new Date(entry.game.releaseDate).getFullYear();
      if (!isNaN(y)) {
        yearCounts[y] = (yearCounts[y] || 0) + 1;
      }
    }

    // 5. Score Data (Scatter)
    if (score && minutes > 60) {
       scoreData.push({
        title: entry.game.title,
        score: score,
        hours: Math.round(hours * 10) / 10,
        image: entry.game.coverImage
      });
    }

    // 6. Score Distribution (Completed Games Only)
    if (isCompleted && score) {
        // Bucket: 0-9, 10-19...
        const bucketStart = Math.floor(score / 10) * 10;
        const bucketLabel = `${bucketStart}-${bucketStart + 9}`;
        scoreBuckets[bucketLabel] = (scoreBuckets[bucketLabel] || 0) + 1;
    }
  }

  // --- Post-Processing Top Played (DLC Merging) ---
  const finalGameMap = new Map<string, { title: string; image: string | null; minutes: number }>();

  // First pass: add all non-DLC games or games without parents in library
  // Actually, we want to sum DLC time TO parent.
  // So we iterate all entries in gameMap.
  // If it has a parentId AND the parent is IN the library (gameMap has parentId), add time to parent.
  // Else, keep it as standalone.

  // However, we need to be careful: the parent entry already exists in gameMap.
  // So we can just modify the parent's minutes in place?
  // But we need to ensure we don't double count if we iterate blindly.
  // We should create a fresh map or list.

  // Let's iterate the library again (or gameMap values)

  // We need to identify which IDs are "absorbed"
  const absorbedIds = new Set<string>();

  // 1. Absorb DLCs
  for (const [id, data] of gameMap.entries()) {
      if (data.isDlc && data.parentId && gameMap.has(data.parentId)) {
          // Parent exists in library. Add minutes to parent.
          const parent = gameMap.get(data.parentId)!;
          parent.minutes += data.minutes;
          absorbedIds.add(id);
      }
  }

  // 2. Build final list
  const topPlayed = Array.from(gameMap.entries())
    .filter(([id]) => !absorbedIds.has(id))
    .map(([id, data]) => ({
        id,
        title: data.title,
        image: data.image,
        minutes: data.minutes,
        hours: Math.round(data.minutes / 60)
    }))
    .sort((a, b) => b.minutes - a.minutes); // Return ALL, client handles pagination

  // --- Formatting Metric Stats ---
  const formatStats = (acc: Record<string, StatAccumulator>): MetricStat[] => {
      return Object.entries(acc)
        .map(([name, data]) => ({
            name,
            owned: data.owned,
            playtime: Math.round(data.playtime),
            completed: data.completed,
            abandoned: data.abandoned
        }))
        .sort((a, b) => b.owned - a.owned); // Default sort by owned? Or let client sort?
        // Let's sort by owned desc for default
  };

  // --- Formatting Score Distribution ---
  const scoreDistribution = Object.entries(scoreBuckets)
    .map(([range, count]) => ({ scoreRange: range, count }))
    .sort((a, b) => parseInt(a.scoreRange) - parseInt(b.scoreRange));

  // --- Community Stats (Unchanged largely, mostly) ---
  const allUserStats = await prisma.userLibrary.groupBy({
    by: ['userId'],
    _count: { gameId: true, _all: true },
    _sum: { playtimeSteam: true },
  });

  const completedStats = await prisma.userLibrary.groupBy({
    by: ['userId'],
    where: { status: 'COMPLETED' },
    _count: { gameId: true }
  });
  const completedMap = new Map<string, number>();
  completedStats.forEach(s => completedMap.set(s.userId, s._count.gameId));

  const communityData = allUserStats.map(s => ({
      userId: s.userId,
      gamesOwned: s._count.gameId,
      hoursPlayed: Math.round((s._sum.playtimeSteam || 0) / 60),
      gamesFinished: completedMap.get(s.userId) || 0
  }));

  const calculateMarketGap = (data: number[], userVal: number) => {
    const sorted = data.sort((a, b) => a - b);
    const percentiles: CommunityStat[] = [];
    for (let i = 0; i <= 100; i += 10) {
      const idx = Math.min(Math.floor((i / 100) * (sorted.length - 1)), sorted.length - 1);
      percentiles.push({ percentile: i, value: sorted[idx] });
    }
    const rank = sorted.filter(v => v < userVal).length;
    const userPercentile = sorted.length > 0 ? Math.round((rank / sorted.length) * 100) : 0;
    return { percentiles, userValue: userVal, userPercentile };
  };

  const marketGap = {
    gamesOwned: calculateMarketGap(communityData.map(d => d.gamesOwned), library.length),
    gamesFinished: calculateMarketGap(communityData.map(d => d.gamesFinished), statusCounts["COMPLETED"] || 0),
    hoursPlayed: calculateMarketGap(communityData.map(d => d.hoursPlayed), Math.round(totalMinutes / 60)),
  };

  // --- Final Return ---
  return {
    counts: {
      totalGames: library.length,
      steamImported: library.filter(e => e.playtimeSteam > 0).length,
      completed: statusCounts["COMPLETED"] || 0,
      playing: statusCounts["PLAYING"] || 0,
      backlog: statusCounts["BACKLOG"] || 0,
      wishlist: statusCounts["WISHLIST"] || 0,
    },
    time: {
      totalMinutes,
      totalHours: Math.round(totalMinutes / 60),
      totalDays: Math.round(totalMinutes / 60 / 24),
      averageScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0
    },
    statusDistribution: ORDERED_STATUSES.map(status => ({
        name: status,
        value: statusCounts[status] || 0,
        fill: getStatusColor(status)
    })).filter(i => i.value > 0),

    topPlayed, // Now full list, merged

    genreStats: formatStats(genreAcc).sort((a,b) => b.owned - a.owned).slice(0, 15), // Top 15
    platformStats: formatStats(platformAcc).sort((a,b) => b.owned - a.owned),
    franchiseStats: formatStats(franchiseAcc).sort((a,b) => b.owned - a.owned).slice(0, 15), // Top 15

    releaseYearDistribution: Object.entries(yearCounts)
        .map(([year, count]) => ({ year: parseInt(year), count }))
        .sort((a, b) => a.year - b.year),

    scoreVsPlaytime: scoreData,
    scoreDistribution,

    marketGap
  };
}

const ORDERED_STATUSES = ["BACKLOG", "PLAYING", "COMPLETED", "ABANDONED", "WISHLIST"];
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
