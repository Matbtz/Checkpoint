"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { User as ProfileUser, PlaySession, UpcomingGame, FriendActivity } from "@/types/profile";
import { differenceInMinutes } from "date-fns";

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
  const recentLibrary = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
      status: "PLAYING",
    },
    include: {
      game: true,
    },
    orderBy: {
      createdAt: "desc", // Use createdAt since updatedAt is missing on UserLibrary
    },
    take: 10,
  });

  const recentPlays: PlaySession[] = recentLibrary.map((entry) => {
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
    const minutes = entry.playtimeManual ?? entry.playtimeSteam;
    let duration = `${minutes}m`;
    if (minutes > 60) duration = `${Math.round(minutes / 60)}h`;

    return {
      game: {
        id: entry.game.id,
        title: entry.game.title,
        coverUrl: entry.game.coverImage || "",
        slug: entry.game.title.toLowerCase().replace(/ /g, "-"), // simplified slug
      },
      progressPercent: progress,
      lastPlayedAt: entry.createdAt.toISOString(), // Use createdAt
      sessionDuration: duration, // Total duration actually, but labels might differ
    };
  });

  // 4. Upcoming Games (Wishlist + future release date)
  const upcomingLibrary = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
      status: "WISHLIST",
      game: {
        releaseDate: {
            gt: new Date(), // Future only
        },
      },
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
