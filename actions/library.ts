'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { searchRawgGame, getRawgGameDetails } from '@/lib/rawg';
import { extractDominantColors } from '@/lib/color-utils';

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
    // New Playground Fields
    playtimeMain?: number | null,
    playtimeExtra?: number | null,
    playtimeCompletionist?: number | null,
  }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get current state to detect changes
  const currentEntry = await prisma.userLibrary.findUnique({
    where: { id: userLibraryId },
    include: { game: true }
  });

  if (!currentEntry) throw new Error("Entry not found");

  // Prepare update data
  const updateData: any = { ...data };

  // --- LOGIC: Auto-Capture Time on Completion ---
  // If status is changing to COMPLETED (and wasn't before)
  if (data.status === 'COMPLETED' && currentEntry.status !== 'COMPLETED') {
    const targetType = data.targetedCompletionType || currentEntry.targetedCompletionType || 'Main';
    const effectiveTime = currentEntry.playtimeManual ?? currentEntry.playtimeSteam; // Minutes

    if (effectiveTime > 0) {
      // Only auto-fill if the specific slot is currently empty to avoid overwriting user edits
      if (targetType === 'Main' && !currentEntry.playtimeMain && !data.playtimeMain) {
        updateData.playtimeMain = effectiveTime;
      } else if (targetType === 'Extra' && !currentEntry.playtimeExtra && !data.playtimeExtra) {
        updateData.playtimeExtra = effectiveTime;
      } else if (targetType === '100%' && !currentEntry.playtimeCompletionist && !data.playtimeCompletionist) {
        updateData.playtimeCompletionist = effectiveTime;
      }
    }
  }

  // If customCoverImage is present (string)
  if (data.customCoverImage && typeof data.customCoverImage === 'string') {
    // Default to null (reset) before extraction
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
      // If extraction fails, we leave them as null (correct behavior)
    }
  }
  // If explicitly null (clearing)
  else if (data.customCoverImage === null) {
    updateData.primaryColor = null;
    updateData.secondaryColor = null;
  }

  // Explicit color override (takes precedence if provided)
  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
  if (data.secondaryColor !== undefined) updateData.secondaryColor = data.secondaryColor;

  await prisma.userLibrary.update({
    where: {
      id: userLibraryId,
      userId: session.user.id
    },
    data: updateData,
  });

  // --- LOGIC: Recalculate Medians ---
  // If any playtime field was updated, trigger aggregation
  if (
    updateData.playtimeMain !== undefined ||
    updateData.playtimeExtra !== undefined ||
    updateData.playtimeCompletionist !== undefined
  ) {
    // We run this asynchronously (fire and forget) or await it?
    // Await to ensure UI shows fresh data on revalidate.
    await recalculateGameMedians(currentEntry.gameId);
  }

  revalidatePath('/dashboard');
}

/**
 * Recalculates the median times for a game based on all user submissions.
 */
async function recalculateGameMedians(gameId: string) {
  // Fetch all user entries with data
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

export async function searchAndAddGame(query: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Check API Key
  if (!process.env.RAWG_API_KEY) {
    throw new Error("Missing RAWG_API_KEY");
  }

  // 1. Search RAWG
  const rawgGame = await searchRawgGame(query);
  if (!rawgGame) {
    console.error("RAWG search returned null for query:", query);
    throw new Error("Game not found on RAWG");
  }

  // 2. Check if game exists in DB
  let game = await prisma.game.findUnique({
    where: { id: String(rawgGame.id) },
  });

  if (!game) {
    // 3. If not, create it.
    const fullDetails = await getRawgGameDetails(rawgGame.id);
    const details = fullDetails || rawgGame;

    game = await prisma.game.create({
      data: {
        id: String(details.id),
        title: details.name,
        coverImage: details.background_image,
        releaseDate: details.released ? new Date(details.released) : null,
        genres: JSON.stringify(details.genres.map((g: { name: any; }) => g.name)),
        dataMissing: true // Flag for enrichment
      }
    });
  }

  // 4. Add to user library
  const existingEntry = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: game.id
      }
    }
  });

  if (!existingEntry) {
    // Task 4: Default status based on release date
    // If release date is in the future, set to WISHLIST, else BACKLOG
    let status = 'BACKLOG';

    // Ensure we compare purely on date part if possible, or just standard comparison.
    // Also handle cases where releaseDate might be today (treated as released).
    if (game.releaseDate) {
      const now = new Date();
      const release = new Date(game.releaseDate);
      // Reset time components to compare only dates
      now.setHours(0, 0, 0, 0);
      release.setHours(0, 0, 0, 0);

      if (release > now) {
        status = 'WISHLIST';
      }
    }

    await prisma.userLibrary.create({
      data: {
        userId: session.user.id,
        gameId: game.id,
        status: status,
      }
    });
  }

  revalidatePath('/dashboard');
  return game;
}

export async function addGameToLibrary(gameId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Check if game exists in DB
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) throw new Error("Game not found");

  // Add to user library if not exists
  const existingEntry = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: game.id
      }
    }
  });

  if (!existingEntry) {
    // Task 4: Default status based on release date
    // If release date is in the future, set to WISHLIST, else BACKLOG
    let status = 'BACKLOG';

    // Ensure we compare purely on date part if possible, or just standard comparison.
    // Also handle cases where releaseDate might be today (treated as released).
    if (game.releaseDate) {
      const now = new Date();
      const release = new Date(game.releaseDate);
      // Reset time components to compare only dates
      now.setHours(0, 0, 0, 0);
      release.setHours(0, 0, 0, 0);

      if (release > now) {
        status = 'WISHLIST';
      }
    }

    await prisma.userLibrary.create({
      data: {
        userId: session.user.id,
        gameId: game.id,
        status: status,
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

  // Verify user owns the game in library (security check)
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
      dataMissing: false // Assume fixed
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
