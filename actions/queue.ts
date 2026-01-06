
'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export async function getPendingEnrichmentGames(): Promise<string[]> {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return [];
  }

  // Get games in user's library that have dataFetched = false
  const userGames = await prisma.userLibrary.findMany({
    where: {
      userId: session.user.id,
      game: {
        dataFetched: false,
      },
    },
    select: {
      gameId: true,
    },
    take: 50, // Fetch in smaller chunks to allow the client to refresh and pick up new ones iteratively
  });

  return userGames.map((ug) => ug.gameId);
}
