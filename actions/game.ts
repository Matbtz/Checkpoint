'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { searchOnlineGames } from './search';

export async function updateGameMetadata(gameId: string, data: {
  title?: string;
  studio?: string;
  genres?: string[]; // Expecting array, will JSON.stringify
  platforms?: string[]; // Expecting array, will JSON.stringify
  metacritic?: number | null;
  opencritic?: number | null;
  releaseDate?: Date | null;
  coverImage?: string;
  backgroundImage?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Verify user has this game in library to allow editing (simple permission check)
  const userLib = await prisma.userLibrary.findUnique({
    where: {
      userId_gameId: {
        userId: session.user.id,
        gameId: gameId,
      },
    },
  });

  if (!userLib) throw new Error("Game not in library");

  const updateData: any = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.studio !== undefined) updateData.studio = data.studio;
  if (data.genres !== undefined) updateData.genres = JSON.stringify(data.genres);
  if (data.platforms !== undefined) updateData.platforms = JSON.stringify(data.platforms);
  if (data.metacritic !== undefined) updateData.metacritic = data.metacritic;
  if (data.opencritic !== undefined) updateData.opencritic = data.opencritic;
  if (data.releaseDate !== undefined) updateData.releaseDate = data.releaseDate;
  if (data.coverImage !== undefined) updateData.coverImage = data.coverImage;
  if (data.backgroundImage !== undefined) updateData.backgroundImage = data.backgroundImage;

  await prisma.game.update({
    where: { id: gameId },
    data: updateData,
  });

  revalidatePath('/dashboard');
}

export async function searchGameImages(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Reuse the existing online search which fetches from IGDB/RAWG
    // and returns EnrichedGameData which includes availableCovers/Backgrounds
    try {
        const results = await searchOnlineGames(query);

        // Aggregate all images from all results
        const covers = new Set<string>();
        const backgrounds = new Set<string>();

        results.forEach(game => {
            if (game.availableCovers && game.availableCovers.length > 0) {
                if (game.availableCovers[0]) covers.add(game.availableCovers[0]);
                game.availableCovers.forEach(c => covers.add(c));
            }

            if (game.availableBackgrounds && game.availableBackgrounds.length > 0) {
                 if (game.availableBackgrounds[0]) backgrounds.add(game.availableBackgrounds[0]);
                 game.availableBackgrounds.forEach(b => backgrounds.add(b));
            }
        });

        return {
            covers: Array.from(covers),
            backgrounds: Array.from(backgrounds)
        };
    } catch (error) {
        console.error("Error searching game images:", error);
        return { covers: [], backgrounds: [] };
    }
}
