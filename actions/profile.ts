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
        // orderBy createdAt is not available on UserLibrary, use basic fetch and sort in memory if needed or verify schema
        // The schema actually has createdAt on UserLibrary. But TS complained about "updatedAt" in the other query?
        // Ah, the error was "updatedAt does not exist in type UserLibraryOrderByWithRelationInput"
        // Let's check schema again. UserLibrary has createdAt. Game has updatedAt. UserLibrary does NOT have updatedAt in the schema file I read?
        // Wait, schema says:
        // model UserLibrary { ... createdAt DateTime @default(now()) ... }
        // It does NOT have updatedAt. That explains the error.
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

  // 2. Derive Profile Data
  // Determine background image: priority to the latest PLAYING game, else fallback
  const fallbackBackground = "https://images.igdb.com/igdb/image/upload/t_1080p/79555.jpg"; // Generic gaming background or fallback
  let backgroundUrl = fallbackBackground;

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
    // To ensure it changes "every new day", we use a seeded random based on the current date and User ID.
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
      orderBy: { id: "asc" }, // Ensure stable order for the seed to work
      select: { game: { select: { backgroundImage: true, screenshots: true } } }
    });

    if (candidates.length > 0) {
      // Simple daily seed: YYYY-MM-DD + UserID
      const today = new Date().toISOString().split('T')[0];
      const seed = userId + today;

      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
      }
      const index = Math.abs(hash) % candidates.length;

      const random = candidates[index];
      backgroundUrl = random.game.backgroundImage || (random.game.screenshots.length > 0 ? random.game.screenshots[0] : backgroundUrl);
    }
  }

  const profileUser: ProfileUser = {
    id: user.id,
    username: user.name || "Gamer",
    avatarUrl: user.image || "",
    profileBackgroundUrl: backgroundUrl,
    profileBackgroundMode: user.profileBackgroundMode,
    profileBackgroundGameId: user.profileBackgroundGameId
  };

  // 3. Recent Plays (Based on UserLibrary status=PLAYING or recently updated)
  // Since ActivityLog isn't fully reliable for history yet, we use UserLibrary 'PLAYING' status
  // sorted by updatedAt.
  // 3. Recent Plays (Based on UserLibrary status=PLAYING or with recent lastPlayed)
  // We fetch two sets to ensure we don't miss:
  // A. Games with actual recent play history (Steam or manual logs)
  // B. Games marked as PLAYING but maybe without history yet (recently added)
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
    // progressManual or steam vs HLTB
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

    // Always show recent playtime (Last 2 weeks)
    if (recentMinutes < 60) {
      duration = `Recent playtime: ${recentMinutes}m`;
    } else {
      duration = `Recent playtime: ${Math.round(recentMinutes / 60)}h`;
    }

    return {
      game: {
        id: entry.game.id,
        title: entry.game.title,
        coverUrl: entry.game.coverImage || "",
        slug: entry.game.title.toLowerCase().replace(/ /g, "-"), // simplified slug
      },
      progressPercent: progress,
      lastPlayedAt: entry.lastPlayed ? entry.lastPlayed.toISOString() : entry.createdAt.toISOString(), // Use lastPlayed if available
      sessionDuration: duration,
    };
  });

  // 4. Upcoming Games (Wishlist + future release date)
  // We include games with future release dates OR no release date (TBA) that are in wishlist.
  // Actually, let's just show all Wishlist items sorted by release date (asc), filtering those in the past in memory if needed,
  // or just relying on the status 'WISHLIST' being the source of truth for "Planned/Upcoming".
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
      coverUrl: entry.game.coverImage || "",
      slug: entry.game.title.toLowerCase().replace(/ /g, "-"),
    },
    releaseDate: entry.game.releaseDate ? entry.game.releaseDate.toISOString() : null,
  }));

  // Sort manually: TBA (null) first, then by date ASC
  upcomingGames.sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return -1; // a is TBA -> comes first
    if (!b.releaseDate) return 1;  // b is TBA -> comes first
    return new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime();
  });

  // 5. Friends Activity
  // We fetched following users. Let's aggregate their latest activity.
  // Currently we only fetched 'take: 1' activity per friend.
  const friendActivities: FriendActivity[] = [];
  user.following.forEach((friend) => {
    if (friend.activityLogs.length > 0) {
      const log = friend.activityLogs[0];
      // Only include if we have game data
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
            coverUrl: log.game.coverImage || "",
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
  if (data.backgroundGameId !== undefined) updateData.profileBackgroundGameId = data.backgroundGameId;

  await prisma.user.update({
    where: { id: userId },
    data: updateData
  });

  // Revalidate profile page
  await revalidatePath("/profile");
}
