'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { searchOnlineGames } from './search';
import { searchRawgGames } from '@/lib/rawg';
import { searchSteamStore } from '@/lib/steam-store';

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

    // Aggregate images from multiple sources
    // 1. IGDB (via searchOnlineGames)
    // 2. RAWG
    // 3. Steam

    const covers = new Set<string>();
    const backgrounds = new Set<string>();

    // Parallelize the requests
    const [igdbResults, rawgResults, steamResults] = await Promise.allSettled([
        searchOnlineGames(query),
        searchRawgGames(query, 5),
        searchSteamStore(query)
    ]);

    // Process IGDB
    if (igdbResults.status === 'fulfilled') {
        igdbResults.value.forEach(game => {
             if (game.availableCovers && game.availableCovers.length > 0) {
                if (game.availableCovers[0]) covers.add(game.availableCovers[0]);
                game.availableCovers.forEach(c => covers.add(c));
            }
            if (game.availableBackgrounds && game.availableBackgrounds.length > 0) {
                 if (game.availableBackgrounds[0]) backgrounds.add(game.availableBackgrounds[0]);
                 game.availableBackgrounds.forEach(b => backgrounds.add(b));
            }
        });
    }

    // Process RAWG
    if (rawgResults.status === 'fulfilled') {
        rawgResults.value.forEach(game => {
            if (game.background_image) {
                // RAWG often uses background_image as a cover/general art
                covers.add(game.background_image);
                backgrounds.add(game.background_image);
            }
            if (game.short_screenshots) {
                game.short_screenshots.forEach(s => backgrounds.add(s.image));
            }
        });
    }

    // Process Steam
    if (steamResults.status === 'fulfilled') {
        steamResults.value.forEach(game => {
            // Steam Cover (Library)
            const libraryUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg`;
            covers.add(libraryUrl);

            // Steam Header
            if (game.header_image) backgrounds.add(game.header_image);

            // We can infer more backgrounds if we assume structure, but let's stick to what we know exists
            // Or try to add a few screenshot URLs blindly if we want:
            // https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{id}/ss_....jpg (hard to guess)
        });
    }

    return {
        covers: Array.from(covers),
        backgrounds: Array.from(backgrounds)
    };
}
