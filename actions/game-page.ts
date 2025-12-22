'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function updateStatusAction(gameId: string, status: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userId = session.user.id;

  // Check if entry exists
  const existing = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId,
        gameId
      }
    }
  });

  if (existing) {
    await prisma.userLibrary.update({
      where: { id: existing.id },
      data: { status }
    });
  } else {
    // Create new entry
    await prisma.userLibrary.create({
      data: {
        userId,
        gameId,
        status,
        playtimeSteam: 0,
        playtimeManual: null,
      }
    });
  }

  revalidatePath(`/game/${gameId}`);
}
