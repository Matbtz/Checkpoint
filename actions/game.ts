'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

interface UpdateGameMetadataPayload {
  platforms?: string[]; // JSON string
  coverImage?: string;
  backgroundImage?: string;
  metacritic?: number | null;
  opencritic?: number | null;
  genres?: string[]; // JSON string
  studio?: string;
}

export async function updateGameMetadata(gameId: string, payload: UpdateGameMetadataPayload) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  try {
    const dataToUpdate: any = {};

    if (payload.platforms) dataToUpdate.platforms = JSON.stringify(payload.platforms);
    if (payload.genres) dataToUpdate.genres = JSON.stringify(payload.genres);
    if (payload.coverImage !== undefined) dataToUpdate.coverImage = payload.coverImage;
    if (payload.backgroundImage !== undefined) dataToUpdate.backgroundImage = payload.backgroundImage;
    if (payload.metacritic !== undefined) dataToUpdate.metacritic = payload.metacritic;
    if (payload.opencritic !== undefined) dataToUpdate.opencritic = payload.opencritic;
    if (payload.studio !== undefined) dataToUpdate.studio = payload.studio;

    if (Object.keys(dataToUpdate).length === 0) return { success: false, error: 'No data to update' };

    await prisma.game.update({
      where: { id: gameId },
      data: dataToUpdate,
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('Error updating game metadata:', error);
    return { success: false, error: 'Failed to update game metadata' };
  }
}
