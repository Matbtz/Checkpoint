"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { User as ProfileUser, PlaySession, UpcomingGame, FriendActivity } from "@/types/profile";
import { differenceInMinutes, subDays } from "date-fns";
import { revalidatePath } from "next/cache";

export async function getUserProfileData() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  // 1. Fetch User Data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      library: {
        where: {
          status: "PLAYING",
        },
        include: {
          game: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
      following: {
        include: {
          activityLogs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              game: true,
            },
          },
        },
        take: 5,
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // 2. Derive Profile Data - Background Image Logic
  let backgroundUrl = "https://images.igdb.com/igdb/image/upload/t_1080p/79555.jpg"; // Default fallback if really nothing found

  // Resolve based on profileBackgroundMode
  const mode = user.profileBackgroundMode || "URL"; // Default to URL if null

  if (mode === "URL" && user.profileBackgroundUrl) {
      backgroundUrl = user.profileBackgroundUrl;
  } else if (mode === "STATIC_GAME" && user.profileBackgroundGameId) {
      const game = await prisma.game.findUnique({
          where: { id: user.profileBackgroundGameId },
          select: { backgroundImage: true, screenshots: true, coverImage: true }
      });
      if (game) {
          backgroundUrl = game.backgroundImage || (game.screenshots.length > 0 ? game.screenshots[0] : game.coverImage || backgroundUrl);
      }
  } else if (mode === "DYNAMIC_LAST") {
      // Find most recent played game
      const lastPlayed = await prisma.userLibrary.findFirst({
          where: { userId },
          orderBy: { lastPlayed: "desc" },
          include: { game: true }
      });
      if (lastPlayed) {
          backgroundUrl = lastPlayed.game.backgroundImage || (lastPlayed.game.screenshots.length > 0 ? lastPlayed.game.screenshots[0] : lastPlayed.game.coverImage || backgroundUrl);
      }
  } else if (mode === "DYNAMIC_RANDOM") {
      // Pick random from BACKLOG or PLAYING
      // Since we can't do RAND() easily in Prisma without raw query, fetch a small batch and pick random
      const candidates = await prisma.userLibrary.findMany({
          where: {
              userId,
              status: { in: ["BACKLOG", "PLAYING"] },
              game: {
                 OR: [
                     { backgroundImage: { not: null } },
                     { screenshots: { isEmpty: false } }
                 ]
              }
          },
          take: 50,
          select: { game: { select: { backgroundImage: true, screenshots: true } } }
      });

      if (candidates.length > 0) {
          const random = candidates[Math.floor(Math.random() * candidates.length)];
          backgroundUrl = random.game.backgroundImage || (random.game.screenshots.length > 0 ? random.game.screenshots[0] : backgroundUrl);
      }
  }

  // Final fallback to ensure we don't return null if logic fails
  if (!backgroundUrl) backgroundUrl = "";


  const profileUser: ProfileUser = {
    id: user.id,
    username: user.name || "Gamer",
    avatarUrl: user.image || "",
    profileBackgroundUrl: backgroundUrl,
    profileBackgroundMode: user.profileBackgroundMode,
    profileBackgroundGameId: user.profileBackgroundGameId
  };

  // 3. Recent Plays (Based on UserLibrary status=PLAYING or recently updated)
  const [playedGames, runningGames] = await prisma.$transaction([
    prisma.userLibrary.findMany({
      where: { userId, lastPlayed: { not: null } },
      include: { game: true },
      orderBy: { lastPlayed: "desc" },
      take: 10,
    }),
    prisma.userLibrary.findMany({
      where: { userId, status: "PLAYING" }, // Fetch "PLAYING" games even if no history
      include: { game: true },
      orderBy: { createdAt: "desc" }, // Use creation time as fallback proxy for relevance
      take: 10,
    })
  ]);

  // Merge and Dedupe
  const combinedMap = new Map();

  [...playedGames, ...runningGames].forEach(item => {
    if (!combinedMap.has(item.gameId)) {
      combinedMap.set(item.gameId, item);
    }
  });

  const recentLibrary = Array.from(combinedMap.values());

  // Sort by execution time (lastPlayed > createdAt)
  recentLibrary.sort((a, b) => {
    const timeA = a.lastPlayed ? a.lastPlayed.getTime() : a.createdAt.getTime();
    const timeB = b.lastPlayed ? b.lastPlayed.getTime() : b.createdAt.getTime();
    return timeB - timeA;
  });

  // Take top 10 after sort
  const topRecent = recentLibrary.slice(0, 10);

  // Fetch ActivityLogs for these games in the last 2 weeks (14 days)
  const twoWeeksAgo = subDays(new Date(), 14);
  const gameIds = topRecent.map(r => r.gameId);

  const activityLogs = await prisma.activityLog.findMany({
      where: {
          userId,
          gameId: { in: gameIds },
          type: "PLAY_SESSION",
          createdAt: { gte: twoWeeksAgo }
      },
      select: {
          gameId: true,
          details: true
      }
  });

  // Helper to sum minutes from logs
  const getManualRecentMinutes = (gameId: string) => {
      const logs = activityLogs.filter(l => l.gameId === gameId);
      return logs.reduce((acc, log) => {
          const details = log.details as { durationMinutes?: number } | null;
          return acc + (details?.durationMinutes || 0);
      }, 0);
  };

  const recentPlays: PlaySession[] = topRecent.map((entry) => {
    // Calculate progress (simplified)
    let progress = 0;
    if (entry.progressManual !== null) {
      progress = entry.progressManual;
    } else {
      // Estimate based on time
      const time = entry.playtimeManual ?? entry.playtimeSteam;
      const hltb = entry.game.hltbMain || 600; // default 10h if missing
      progress = Math.min(100, Math.round((time / hltb) * 100));
    }

    // Format duration
    // Logic: If Steam game, use playtime2weeks from Steam.
    // If not Steam (or manual overrides), use calculated log sum.
    let recentMinutes = 0;

    // Check if game is linked to Steam (has steamAppId) OR user has steam connection
    // But strictly speaking, we trust `playtime2weeks` if it's > 0 or if it's a Steam game.
    // However, entry.playtime2weeks is explicitly "Steam Recent".
    if (entry.game.steamAppId) {
        recentMinutes = entry.playtime2weeks ?? 0;
    } else {
        recentMinutes = getManualRecentMinutes(entry.gameId);
    }

    let duration = "";
    if (recentMinutes < 60) {
      duration = `Recent playtime: ${recentMinutes}m`;
    } else {
      duration = `Recent playtime: ${Math.round(recentMinutes / 60)}h`;
    }

    // Image logic: STRICTLY from DB. No external fallback in URL.
    // entry.game.coverImage is the primary source.
    // If missing, use backgroundImage.
    // If both missing, use a local placeholder (not external).
    const coverUrl = entry.game.coverImage || entry.game.backgroundImage || "/placeholder-game.png";

    return {
      game: {
        id: entry.game.id,
        title: entry.game.title,
        coverUrl: coverUrl,
        slug: entry.game.title.toLowerCase().replace(/ /g, "-"), // simplified slug
      },
      progressPercent: progress,
      lastPlayedAt: entry.lastPlayed ? entry.lastPlayed.toISOString() : entry.createdAt.toISOString(), // Use lastPlayed if available
      sessionDuration: duration,
    };
  });

  // 4. Upcoming Games (Wishlist + future release date)
  const upcomingLibrary = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
      status: "WISHLIST",
      OR: [
        {
          game: {
            releaseDate: {
              gt: new Date(),
            },
          }
        },
        {
          game: {
            releaseDate: null
          }
        }
      ]
    },
    include: {
      game: true,
    },
    orderBy: {
      game: {
        releaseDate: "asc",
      },
    },
    take: 10,
  });

  const upcomingGames: UpcomingGame[] = upcomingLibrary.map((entry) => ({
    game: {
      id: entry.game.id,
      title: entry.game.title,
      coverUrl: entry.game.coverImage || "/placeholder-game.png",
      slug: entry.game.title.toLowerCase().replace(/ /g, "-"),
    },
    releaseDate: entry.game.releaseDate ? entry.game.releaseDate.toISOString() : new Date().toISOString(),
  }));

  // 5. Friends Activity
  const friendActivities: FriendActivity[] = [];
  user.following.forEach((friend) => {
    if (friend.activityLogs.length > 0) {
      const log = friend.activityLogs[0];
      if (log.game) {
        friendActivities.push({
          friend: {
            id: friend.id,
            username: friend.name || "Friend",
            avatarUrl: friend.image || "",
            profileBackgroundUrl: "", // not needed for small card
          },
          game: {
            id: log.game.id,
            title: log.game.title,
            coverUrl: log.game.coverImage || "/placeholder-game.png",
            slug: log.game.title.toLowerCase().replace(/ /g, "-"),
          },
        });
      }
    }
  });

  return {
    user: profileUser,
    recentPlays,
    upcomingGames,
    friendActivities,
  };
}

export async function updateUserProfile(data: {
    avatarUrl?: string;
    backgroundUrl?: string;
    backgroundMode?: string;
    backgroundGameId?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const updateData: any = {};

  if (data.avatarUrl !== undefined) updateData.image = data.avatarUrl;
  if (data.backgroundUrl !== undefined) updateData.profileBackgroundUrl = data.backgroundUrl;
  if (data.backgroundMode !== undefined) updateData.profileBackgroundMode = data.backgroundMode;
  // allow setting null
  if (data.backgroundGameId !== undefined) updateData.profileBackgroundGameId = data.backgroundGameId;

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  // Revalidate profile page
  await revalidatePath("/profile");
}
