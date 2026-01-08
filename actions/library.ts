'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { searchRawgGame, getRawgGameDetails } from '@/lib/rawg';
import { extractDominantColors } from '@/lib/color-utils';

// Helper to determine owned platforms
function determineOwnedPlatforms(gamePlatforms: any, userPlatforms: string[]) {
    let gPlatforms: string[] = [];
    if (Array.isArray(gamePlatforms)) {
        gPlatforms = gamePlatforms.map((p: any) =>
            typeof p === 'string' ? p : p?.name
        ).filter((p): p is string => typeof p === 'string' && !!p);
    }

    // Rule 1: Game has only 1 platform -> Select it
    if (gPlatforms.length === 1) {
        return [gPlatforms[0]];
    }

    // Rule 2: Intersection with User Platforms has only 1 match -> Select it
    if (userPlatforms.length > 0) {
        const intersection = gPlatforms.filter(p => userPlatforms.includes(p));
        if (intersection.length === 1) {
            return [intersection[0]];
        }
    }

    return [];
}

export async function updateLibraryEntry(
  userLibraryId: string,
  data: {
    status?: string,
    playtimeManual?: number | null,
    progressManual?: number | null,
    targetedCompletionType?: string,
    customCoverImage?: string | null,
    primaryColor?: string | null,
    secondaryColor?: string | null,
    playtimeMain?: number | null,
    playtimeExtra?: number | null,
    playtimeCompletionist?: number | null,
    ownedPlatforms?: string[],
    isManualProgress?: boolean
  }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const currentEntry = await prisma.userLibrary.findUnique({
    where: { id: userLibraryId },
    include: { game: true }
  });

  if (!currentEntry) throw new Error("Entry not found");

  const updateData: any = { ...data };

  // Playtime History Tracking for Manual Updates
  if (data.playtimeManual !== undefined && data.playtimeManual !== null) {
      const oldTime = currentEntry.playtimeManual || 0;
      const newTime = data.playtimeManual;
      const diff = newTime - oldTime;

      // Only record positive increments as play sessions
      if (diff > 0) {
          await prisma.activityLog.create({
              data: {
                  userId: session.user.id,
                  gameId: currentEntry.gameId,
                  type: "PLAY_SESSION",
                  details: { durationMinutes: diff }
              }
          });
          updateData.lastPlayed = new Date();
      }
  }

  // Logic: Auto-Capture Time on Completion
  if (data.status === 'COMPLETED' && currentEntry.status !== 'COMPLETED') {
    const targetType = data.targetedCompletionType || currentEntry.targetedCompletionType || 'Main';
    const effectiveTime = currentEntry.playtimeManual ?? currentEntry.playtimeSteam;

    if (effectiveTime > 0) {
      if (targetType === 'Main' && !currentEntry.playtimeMain && !data.playtimeMain) {
        updateData.playtimeMain = effectiveTime;
      } else if (targetType === 'Extra' && !currentEntry.playtimeExtra && !data.playtimeExtra) {
        updateData.playtimeExtra = effectiveTime;
      } else if (targetType === '100%' && !currentEntry.playtimeCompletionist && !data.playtimeCompletionist) {
        updateData.playtimeCompletionist = effectiveTime;
      }
    }
  }

  // Cover Image Logic
  if (data.customCoverImage && typeof data.customCoverImage === 'string') {
    updateData.primaryColor = null;
    updateData.secondaryColor = null;
    try {
      const colors = await extractDominantColors(data.customCoverImage);
      if (colors && colors.primary) {
        updateData.primaryColor = colors.primary;
        updateData.secondaryColor = colors.secondary;
      }
    } catch (e) {
      console.error("Failed to extract colors for custom cover:", e);
    }
  } else if (data.customCoverImage === null) {
    updateData.primaryColor = null;
    updateData.secondaryColor = null;
  }

  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
  if (data.secondaryColor !== undefined) updateData.secondaryColor = data.secondaryColor;

  // Explicitly handle ownedPlatforms
  if (data.ownedPlatforms !== undefined) {
      updateData.ownedPlatforms = data.ownedPlatforms;
  }

  // Handle isManualProgress
  if (data.isManualProgress !== undefined) {
      updateData.isManualProgress = data.isManualProgress;
  }

  await prisma.userLibrary.update({
    where: {
      id: userLibraryId,
      userId: session.user.id
    },
    data: updateData,
  });

  if (
    updateData.playtimeMain !== undefined ||
    updateData.playtimeExtra !== undefined ||
    updateData.playtimeCompletionist !== undefined
  ) {
    await recalculateGameMedians(currentEntry.gameId);
  }

  revalidatePath('/dashboard');
}

async function recalculateGameMedians(gameId: string) {
  const entries = await prisma.userLibrary.findMany({
    where: {
      gameId: gameId,
      OR: [
        { playtimeMain: { not: null } },
        { playtimeExtra: { not: null } },
        { playtimeCompletionist: { not: null } }
      ]
    },
    select: {
      playtimeMain: true,
      playtimeExtra: true,
      playtimeCompletionist: true
    }
  });

  const calculateMedian = (values: number[]) => {
    if (values.length === 0) return null;
    values.sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    if (values.length % 2) return values[half];
    return Math.round((values[half - 1] + values[half]) / 2.0);
  };

  const mains = entries.map(e => e.playtimeMain).filter((n): n is number => n !== null && n > 0);
  const extras = entries.map(e => e.playtimeExtra).filter((n): n is number => n !== null && n > 0);
  const comps = entries.map(e => e.playtimeCompletionist).filter((n): n is number => n !== null && n > 0);

  const usersMain = calculateMedian(mains);
  const usersExtra = calculateMedian(extras);
  const usersCompletionist = calculateMedian(comps);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      usersMain,
      usersMainCount: mains.length,
      usersExtra,
      usersExtraCount: extras.length,
      usersCompletionist,
      usersCompletionistCount: comps.length
    }
  });
}

export async function extractColorsAction(url: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return await extractDominantColors(url);
}

export async function updateGameStatus(gameId: string, status: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.update({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: gameId,
      },
    },
    data: { status },
  });

  revalidatePath('/dashboard');
}

export async function updateTargetedCompletion(gameId: string, type: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.update({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: gameId,
      },
    },
    data: { targetedCompletionType: type },
  });

  revalidatePath('/dashboard');
}

export async function updateManualPlayTime(gameId: string, minutes: number | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.update({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: gameId,
      },
    },
    data: { playtimeManual: minutes },
  });

  revalidatePath('/dashboard');
}

export async function updateOwnedPlatforms(gameId: string, platforms: string[]) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    await prisma.userLibrary.update({
        where: {
            userId_gameId: { userId: session.user.id, gameId }
        },
        data: { ownedPlatforms: platforms }
    });
    revalidatePath('/dashboard');
    revalidatePath(`/game/${gameId}`);
}

export async function searchAndAddGame(query: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (!process.env.RAWG_API_KEY) {
    throw new Error("Missing RAWG_API_KEY");
  }

  const rawgGame = await searchRawgGame(query);
  if (!rawgGame) {
    console.error("RAWG search returned null for query:", query);
    throw new Error("Game not found on RAWG");
  }

  let game = await prisma.game.findUnique({
    where: { id: String(rawgGame.id) },
  });

  if (!game) {
    const fullDetails = await getRawgGameDetails(rawgGame.id);
    const details = fullDetails || rawgGame;

    game = await prisma.game.create({
      data: {
        id: String(details.id),
        title: details.name,
        coverImage: details.background_image,
        releaseDate: details.released ? new Date(details.released) : null,
        genres: JSON.stringify(details.genres.map((g: { name: any; }) => g.name)),
        dataMissing: true
      }
    });
  }

  const existingEntry = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: game.id
      }
    }
  });

  if (!existingEntry) {
    let status = 'BACKLOG';
    if (game.releaseDate) {
      const now = new Date();
      const release = new Date(game.releaseDate);
      now.setHours(0, 0, 0, 0);
      release.setHours(0, 0, 0, 0);
      if (release > now) status = 'WISHLIST';
    }

    let targetedCompletionType = 'Main';
    let userPlatforms: string[] = [];
    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { preferences: true, platforms: true }
        });
        if (user) {
            userPlatforms = user.platforms;
            if (user.preferences) {
                const parsed = JSON.parse(user.preferences);
                if (parsed.defaultCompletionGoal) {
                    targetedCompletionType = parsed.defaultCompletionGoal;
                }
            }
        }
    } catch { }

    const ownedPlatforms = determineOwnedPlatforms(game.platforms, userPlatforms);

    await prisma.userLibrary.create({
      data: {
        userId: session.user.id,
        gameId: game.id,
        status: status,
        targetedCompletionType: targetedCompletionType,
        ownedPlatforms: ownedPlatforms
      }
    });
  }

  revalidatePath('/dashboard');
  return game;
}

export async function addGameToLibrary(gameId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) throw new Error("Game not found");

  const existingEntry = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: game.id
      }
    }
  });

  if (!existingEntry) {
    let status = 'BACKLOG';
    if (game.releaseDate) {
      const now = new Date();
      const release = new Date(game.releaseDate);
      now.setHours(0, 0, 0, 0);
      release.setHours(0, 0, 0, 0);
      if (release > now) status = 'WISHLIST';
    }

    let targetedCompletionType = 'Main';
    let userPlatforms: string[] = [];
    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { preferences: true, platforms: true }
        });
        if (user) {
            userPlatforms = user.platforms;
            if (user.preferences) {
                const parsed = JSON.parse(user.preferences);
                if (parsed.defaultCompletionGoal) {
                    targetedCompletionType = parsed.defaultCompletionGoal;
                }
            }
        }
    } catch { }

    const ownedPlatforms = determineOwnedPlatforms(game.platforms, userPlatforms);

    await prisma.userLibrary.create({
      data: {
        userId: session.user.id,
        gameId: game.id,
        status: status,
        targetedCompletionType: targetedCompletionType,
        ownedPlatforms: ownedPlatforms
      }
    });
  }

  revalidatePath(`/game/${gameId}`);
  revalidatePath('/dashboard');
}

export async function removeGamesFromLibrary(gameIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.deleteMany({
    where: {
      userId: session.user.id,
      gameId: { in: gameIds }
    }
  });

  revalidatePath('/dashboard');
}

export async function fixGameMatch(gameId: string, hltbData: { main: number, extra: number, completionist: number }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userLib = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: gameId,
      }
    }
  });

  if (!userLib) throw new Error("Game not in library");

  await prisma.game.update({
    where: { id: gameId },
    data: {
      hltbMain: Math.round(hltbData.main),
      hltbExtra: Math.round(hltbData.extra),
      hltbCompletionist: Math.round(hltbData.completionist),
      dataMissing: false
    }
  });

  revalidatePath('/dashboard');
}

export async function updateGamesStatus(gameIds: string[], status: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.updateMany({
    where: {
      userId: session.user.id,
      gameId: { in: gameIds }
    },
    data: { status }
  });

  revalidatePath('/dashboard');
}
