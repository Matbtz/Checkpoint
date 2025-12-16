'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { searchRawgGame, getRawgGameDetails } from '@/lib/rawg';

export async function updateLibraryEntry(userLibraryId: string, data: { status?: string, playtimeManual?: number | null, progressManual?: number | null, targetedCompletionType?: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.userLibrary.update({
    where: {
      id: userLibraryId,
      userId: session.user.id
    },
    data: data,
  });

  revalidatePath('/dashboard');
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
            hltbTimes: JSON.stringify(hltbData),
            dataMissing: false // Assume fixed
        }
    });

    revalidatePath('/dashboard');
}
