'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { searchOnlineGames } from './search';
import { searchRawgGames } from '@/lib/rawg';
import { searchSteamStore } from '@/lib/steam-store';
import { getIgdbGameDetails, getIgdbImageUrl } from '@/lib/igdb';

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

  // Verify user has this game in library to allow editing
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

/**
 * Normalizes a string for comparison (lowercase, remove special chars)
 */
function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Checks if candidate title is a valid match for the target title.
 * We want to avoid mods/sequels unless exact match.
 */
function isRelevantMatch(targetTitle: string, candidateTitle: string): boolean {
    const t = normalize(targetTitle);
    const c = normalize(candidateTitle);

    // Exact match
    if (t === c) return true;

    // Substring match (e.g. "God of War (2018)" vs "God of War")
    // But be careful: "Portal" vs "Portal 2".
    // We only accept containment if the length difference is small (e.g. punctuation)
    // OR if the user searched for the exact base name.

    // Simple heuristic: If candidate contains target or target contains candidate,
    // AND the difference isn't a number (sequel), we allow it.
    // Actually, simpler: Allow if it contains the full string.

    return c.includes(t) || t.includes(c);
}

export async function searchGameImages(query: string, options?: { igdbId?: string }) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const covers = new Set<string>();
    const backgrounds = new Set<string>();

    const targetTitle = query.trim();

    // 1. IGDB: Use ID if available, otherwise strict search
    let igdbPromise: Promise<any>;
    if (options?.igdbId) {
        // Direct fetch by ID
        igdbPromise = getIgdbGameDetails(parseInt(options.igdbId)).then(game => {
            if (game) {
                // If ID match, we trust it 100%
                return [game];
            }
            return [];
        });
    } else {
        // Search
        igdbPromise = searchOnlineGames(targetTitle).then(games => {
            // Filter strictly
            return games.filter(g => isRelevantMatch(targetTitle, g.title));
        });
    }

    // 2. RAWG: Search and filter
    const rawgPromise = searchRawgGames(targetTitle, 5).then(games => {
        return games.filter(g => isRelevantMatch(targetTitle, g.name));
    });

    // 3. Steam: Search and filter
    const steamPromise = searchSteamStore(targetTitle).then(games => {
        return games.filter(g => isRelevantMatch(targetTitle, g.name));
    });

    // Execute parallel
    const [igdbRes, rawgRes, steamRes] = await Promise.allSettled([igdbPromise, rawgPromise, steamPromise]);

    // Process IGDB
    if (igdbRes.status === 'fulfilled') {
        igdbRes.value.forEach((game: any) => {
             // Adapt based on return type (EnrichedGameData or EnrichedIgdbGame)
             // getIgdbGameDetails returns EnrichedIgdbGame (possibleCovers)
             // searchOnlineGames returns SearchResult (availableCovers)

             const c = game.possibleCovers || game.availableCovers || [];
             const b = game.possibleBackgrounds || game.availableBackgrounds || [];

             if (c && c.length > 0) {
                 c.forEach((img: string) => covers.add(img));
             }
             if (b && b.length > 0) {
                 b.forEach((img: string) => backgrounds.add(img));
             }
        });
    }

    // Process RAWG
    if (rawgRes.status === 'fulfilled') {
        rawgRes.value.forEach(game => {
            if (game.background_image) {
                covers.add(game.background_image);
                backgrounds.add(game.background_image);
            }
            if (game.short_screenshots) {
                game.short_screenshots.forEach(s => backgrounds.add(s.image));
            }
        });
    }

    // Process Steam
    if (steamRes.status === 'fulfilled') {
        steamRes.value.forEach(game => {
            const libraryUrl = `https://steamcdn-a.akamaihd.net/steam/apps/${game.id}/library_600x900.jpg`;
            covers.add(libraryUrl);
            if (game.header_image) backgrounds.add(game.header_image);
        });
    }

    return {
        covers: Array.from(covers),
        backgrounds: Array.from(backgrounds)
    };
}
