'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { searchOnlineGames } from './search';
import { searchRawgGames } from '@/lib/rawg';
import { searchSteamStore } from '@/lib/steam-store';
import { getIgdbGameDetails } from '@/lib/igdb';

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
 * Checks if candidate is valid based on Title and Year.
 */
function isStrictMatch(
    targetTitle: string,
    targetYear: number | undefined,
    candidateTitle: string,
    candidateYear: number | null | undefined
): boolean {
    const t = normalize(targetTitle);
    const c = normalize(candidateTitle);

    // 1. Title Check
    // If exact match (normalized), pass immediately
    if (t === c) return true;

    // If titles are different:
    // "Super Smash Bros" (t) vs "Super Smash Bros Ultimate" (c)
    // c includes t.
    // If c is significantly longer than t (more than just a punctuation diff), it's likely a sequel/spinoff.
    // e.g. "Ultimate" adds 8 chars.
    const lengthDiff = Math.abs(c.length - t.length);
    const isSubstring = c.includes(t) || t.includes(c);

    // If it's a substring but the length difference is big (> 3 chars, covers "II", "2", "GOTY", "Ultimate"),
    // we should be suspicious and rely on Year.
    const ambiguousTitle = isSubstring && lengthDiff > 3;

    // 2. Year Check (if available)
    if (targetYear && candidateYear) {
        const diff = Math.abs(targetYear - candidateYear);
        // Allow 1 year margin (regional release differences)
        if (diff <= 1) {
            // If year matches, we can be more lenient with title (e.g. "God of War" 2018 vs "God of War")
            // But if title is ambiguous (like "Ultimate"), and year matches?
            // Smash Ultimate (2018) vs Smash (1999). Years won't match.
            // God of War (2018) vs God of War (2005). Years won't match.
            return true;
        } else {
            // Year mismatch > 1.
            // If title is EXACT, it might be a remake or just data error.
            // But if title is NOT exact, reject.
            if (t !== c) return false;
        }
    }

    // If we don't have year data to confirm, and title is ambiguous (e.g. sequel), reject to be safe.
    if (ambiguousTitle) return false;

    // Fallback: substring match with small diff or contained
    return isSubstring;
}

export async function searchGameImages(query: string, options?: { igdbId?: string, releaseYear?: number }) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const covers = new Set<string>();
    const backgrounds = new Set<string>();

    const targetTitle = query.trim();
    const targetYear = options?.releaseYear;

    // 1. IGDB
    let igdbPromise: Promise<any>;
    if (options?.igdbId) {
        igdbPromise = getIgdbGameDetails(parseInt(options.igdbId)).then(game => {
            return game ? [game] : [];
        });
    } else {
        igdbPromise = searchOnlineGames(targetTitle).then(games => {
            return games.filter(g => {
                const year = g.releaseDate ? new Date(g.releaseDate).getFullYear() : undefined;
                return isStrictMatch(targetTitle, targetYear, g.title, year);
            });
        });
    }

    // 2. RAWG
    const rawgPromise = searchRawgGames(targetTitle, 5).then(games => {
        return games.filter(g => {
             const year = g.released ? new Date(g.released).getFullYear() : undefined;
             return isStrictMatch(targetTitle, targetYear, g.name, year);
        });
    });

    // 3. Steam
    const steamPromise = searchSteamStore(targetTitle).then(games => {
        return games.filter(g => {
            return isStrictMatch(targetTitle, targetYear, g.name, g.releaseYear);
        });
    });

    const [igdbRes, rawgRes, steamRes] = await Promise.allSettled([igdbPromise, rawgPromise, steamPromise]);

    // Helper to add images
    const addImages = (c: string[], b: string[]) => {
        c.forEach(img => covers.add(img));
        b.forEach(img => backgrounds.add(img));
    };

    // Process IGDB
    if (igdbRes.status === 'fulfilled') {
        igdbRes.value.forEach((game: any) => {
             const c = game.possibleCovers || game.availableCovers || [];
             const b = game.possibleBackgrounds || game.availableBackgrounds || [];
             addImages(c, b);
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
