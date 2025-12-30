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
        secondaryColor?: string | null
    }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Prepare update data
  const updateData: any = { ...data };

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

  revalidatePath('/dashboard');
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
        await prisma.userLibrary.create({
            data: {
                userId: session.user.id,
                gameId: game.id,
                status: 'Backlog',
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
        await prisma.userLibrary.create({
            data: {
                userId: session.user.id,
                gameId: game.id,
                status: 'BACKLOG',
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
