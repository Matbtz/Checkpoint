"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { User as ProfileUser, PlaySession, UpcomingGame, FriendActivity } from "@/types/profile";
import { differenceInMinutes } from "date-fns";
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

  if (user.library.length > 0 && user.library[0].game.backgroundImage) {
    backgroundUrl = user.library[0].game.backgroundImage;
  } else if (user.library.length > 0 && user.library[0].game.screenshots.length > 0) {
    backgroundUrl = user.library[0].game.screenshots[0];
  }

  const profileUser: ProfileUser = {
    id: user.id,
    username: user.name || "Gamer",
    avatarUrl: user.image || "",
    profileBackgroundUrl: backgroundUrl,
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
    const recentMinutes = entry.playtime2weeks ?? 0;
    const totalMinutes = entry.playtimeManual ?? entry.playtimeSteam;

    let duration = "";

    if (recentMinutes > 0) {
      // Show recent steam activity
      if (recentMinutes < 60) {
        duration = `${recentMinutes}m (2 weeks)`;
      } else {
        duration = `${Math.round(recentMinutes / 60)}h (2 weeks)`;
      }
    } else {
      // Fallback to total
      if (totalMinutes < 60) {
        duration = `Total: ${totalMinutes}m`;
      } else {
        duration = `Total: ${Math.round(totalMinutes / 60)}h`;
      }
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
    releaseDate: entry.game.releaseDate ? entry.game.releaseDate.toISOString() : new Date().toISOString(),
  }));

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

export async function updateUserProfile(data: { avatarUrl?: string; backgroundUrl?: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  await prisma.user.update({
    where: { id: userId },
    data: {
      image: data.avatarUrl,
      profileBackgroundUrl: data.backgroundUrl,
    },
  });

  // Revalidate profile page
  await revalidatePath("/profile");
}
