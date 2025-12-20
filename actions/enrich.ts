'use server';

import { prisma } from '@/lib/db';
import { searchHowLongToBeat } from '@/lib/hltb';
import { revalidatePath } from 'next/cache';

interface EnrichResult {
  success: boolean;
  message: string;
}

export async function enrichGameData(gameId: string, gameTitle: string): Promise<EnrichResult> {
  if (!gameId || !gameTitle) {
    return { success: false, message: 'Missing game ID or title' };
  }

  const rawgApiKey = process.env.RAWG_API_KEY;
  if (!rawgApiKey) {
    console.error('Missing RAWG_API_KEY');
    return { success: false, message: 'Server configuration error' };
  }

  const dataToUpdate: any = {
    lastSync: new Date(),
    dataFetched: true,
    dataMissing: false
  };

  // 1. RAWG Fetch Promise
  const rawgPromise = (async () => {
    try {
        const rawgResponse = await fetch(
          `https://api.rawg.io/api/games?key=${rawgApiKey}&search=${encodeURIComponent(gameTitle)}&page_size=1`
        );

        if (!rawgResponse.ok) {
           console.error('RAWG API error:', rawgResponse.statusText);
           return;
        }

        const rawgData = await rawgResponse.json();
        const rawgGame = rawgData.results?.[0];

        if (!rawgGame) return;

        let rawgDetails = rawgGame;
        // Fetch full details for description if possible
        try {
             const detailResponse = await fetch(`https://api.rawg.io/api/games/${rawgGame.id}?key=${rawgApiKey}`);
             if(detailResponse.ok) {
                rawgDetails = await detailResponse.json();
             }
        } catch(e) {
            // Ignore detail fetch error, use basic info
        }

        // Mapping requested:
        // coverUrl: rawgData.background_image
        if (rawgDetails.background_image) {
            dataToUpdate.backgroundImage = rawgDetails.background_image;
            dataToUpdate.coverImage = rawgDetails.background_image;
        }

        // releaseDate: new Date(rawgData.released)
        if (rawgDetails.released) {
            dataToUpdate.releaseDate = new Date(rawgDetails.released);
        }

        // description: rawgData.description_raw (si dispo)
        if (rawgDetails.description_raw || rawgDetails.description) {
            dataToUpdate.description = rawgDetails.description_raw || rawgDetails.description;
        }

        // rawgRating: rawgData.rating
        if (rawgDetails.rating) {
            dataToUpdate.rawgRating = rawgDetails.rating;
        }

        // metacritic: rawgData.metacritic
        if (rawgDetails.metacritic) {
            dataToUpdate.metacritic = rawgDetails.metacritic;
        }

        // Genres
        if (rawgDetails.genres && Array.isArray(rawgDetails.genres)) {
            dataToUpdate.genres = JSON.stringify(rawgDetails.genres.map((g: any) => g.name));
        }

        // Platforms
        if (rawgDetails.platforms && Array.isArray(rawgDetails.platforms)) {
             // RAWG structure: [{ platform: { id, name, slug } }, ...]
             // Schema expects Json? which matches [{ name: "Switch", date: "2017-10-27" }]
             // RAWG usually gives released_at inside the platform object if detailed, or main released date.
             // For now, mapping names to simple objects or just array of strings if that's what we want.
             // But let's stick to the requested structure or just name.
             // If we just have name, we can do { name: p.platform.name }.

             // Previous behavior was stringified array of strings ["PC", "PS5"].
             // The new schema expects Json.
             // Let's store [{ name: "PC" }, { name: "PS5" }] to be consistent with the new object structure idea
             // OR just the array of strings if we want to keep it simple, as Json can be any valid JSON.
             // Given the other components seem to handle string[] or {name} objects, let's store objects.

             const platforms = rawgDetails.platforms.map((p: any) => ({
                 name: p.platform?.name,
                 slug: p.platform?.slug
             })).filter((p: any) => p.name);

             if (platforms.length > 0) {
                 dataToUpdate.platforms = platforms;
             }
        }

    } catch (error) {
        console.error("RAWG Fetch Error:", error);
    }
  })();

  // 2. HLTB Fetch Promise
  const hltbPromise = (async () => {
    try {
        const hltbResult = await searchHowLongToBeat(gameTitle);

        if (hltbResult) {
            // New lib/hltb.ts returns MINUTES.
            // Existing DB and calculateProgress expects HOURS.
            // So we convert Minutes -> Hours.
            const mainHours = Math.round((hltbResult.main / 60) * 10) / 10;
            const extraHours = Math.round((hltbResult.extra / 60) * 10) / 10;
            const completionistHours = Math.round((hltbResult.completionist / 60) * 10) / 10;

            // Update specific fields (assuming Int in schema, but we rounded to 1 decimal.
            // If Schema is Int, it will truncate or round.
            // Schema says `Int?`. So 10.5 becomes 10 or 11.
            // Wait, calculateProgress expects hours, but if schema stores Int, we lose precision.
            // Let's check schema again. `hltbMain Int?`.
            // If I store 10.5, Prisma might error or round.
            // However, `hltbTimes` stores JSON string.
            // We should store the float values in `hltbTimes` JSON, and maybe rounded Ints in the columns.

            dataToUpdate.hltbMain = Math.round(mainHours);
            dataToUpdate.hltbExtra = Math.round(extraHours);
            dataToUpdate.hltbCompletionist = Math.round(completionistHours);

            // Store full precision (well, 1 decimal) in JSON for the UI to use if it prefers
            dataToUpdate.hltbTimes = JSON.stringify({
                main: mainHours,
                extra: extraHours,
                completionist: completionistHours
            });
        }
    } catch (error) {
        console.error("HLTB Error:", error);
        // Continue, don't fail just because HLTB failed
    }
  })();

  await Promise.allSettled([rawgPromise, hltbPromise]);

  try {
      await prisma.game.update({
          where: { id: gameId },
          data: dataToUpdate,
      });
      revalidatePath('/dashboard');
      return { success: true, message: 'Game enriched successfully' };
  } catch (error) {
      console.error("Database Update Failed:", error);
      return { success: false, message: 'Database update failed' };
  }
}
