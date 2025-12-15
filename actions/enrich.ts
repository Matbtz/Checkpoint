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

  try {
    // 1. Fetch RAWG Data
    const rawgResponse = await fetch(
      `https://api.rawg.io/api/games?key=${rawgApiKey}&search=${encodeURIComponent(gameTitle)}&page_size=1`
    );

    if (!rawgResponse.ok) {
       console.error('RAWG API error:', rawgResponse.statusText);
    }

    const rawgData = await rawgResponse.json();
    const rawgGame = rawgData.results?.[0];

    let rawgDetails = null;
    if (rawgGame) {
        // Fetch full details for description
        const detailResponse = await fetch(`https://api.rawg.io/api/games/${rawgGame.id}?key=${rawgApiKey}`);
        if(detailResponse.ok) {
            rawgDetails = await detailResponse.json();
        }
    }

    const dataToUpdate: any = {
        lastSync: new Date(),
    };

    if (rawgDetails || rawgGame) {
        const g = rawgDetails || rawgGame;
        if (g.description_raw || g.description) dataToUpdate.description = g.description_raw || g.description;

        // Fix: Mapping for coverUrl and Fallback
        if (g.background_image) {
            dataToUpdate.backgroundImage = g.background_image;
            // Also update coverImage as requested if it's missing or if we want to ensure high quality.
            // However, the prompt says "coverUrl: doit prendre la valeur de rawgGame.background_image".
            // The schema has `coverImage`. We should probably update it.
            // And "Fallback Image: Si RAWG ne renvoie pas d'image, garde l'URL Steam... générée lors de l'import initial (ne l'écrase pas avec null)."
            // So if `g.background_image` is present, we update `coverImage`.
            dataToUpdate.coverImage = g.background_image;
        }

        // Fix: genres mapping to comma-separated string as requested
        // BUT: The frontend expects a JSON array or handles string?
        // GameCard.tsx: try { return game.genres ? JSON.parse(game.genres) : []; }
        // If we save it as a string "Action, Adventure", JSON.parse will fail (or return string?).
        // If it fails, GameCard returns [].
        // So we MUST also update GameCard.tsx to handle comma-separated strings if we change this.
        // Or we stick to JSON array but the prompt EXPLICITLY said: `genres: doit prendre rawgGame.genres.map(g => g.name).join(", ")`.
        // I will follow the prompt and update GameCard.tsx.
        if (g.genres) {
            dataToUpdate.genres = g.genres.map((gen: any) => gen.name).join(", ");
        }

        // Fix: releaseDate mapping
        if (g.released) {
            dataToUpdate.releaseDate = new Date(g.released);
        }

        if (g.rating) dataToUpdate.rawgRating = g.rating;
        if (g.metacritic) dataToUpdate.metacritic = g.metacritic;
    }

    // 2. Fetch HowLongToBeat Data
    try {
        const hltbResults = await searchHowLongToBeat(gameTitle);
        // Find best match. Simple exact match or first result.
        const bestMatch = hltbResults.find(r => r.name.toLowerCase() === gameTitle.toLowerCase()) || hltbResults[0];

        if (bestMatch) {
            // HLTB service now returns HOURS.
            // We need to store them. The schema has Int.
            // `lib/format-utils.ts` expects HOURS in `calculateProgress`.
            // So if I store 10 (hours), calculateProgress does 10 * 60 = 600 minutes.
            // But `playtimeSteam` is in minutes.
            // So logic matches: store HOURS in DB.

            // Wait, schema comment: "hltbMain Int? // En minutes"
            // If schema comment says minutes, but format-utils treats it as hours...
            // `format-utils.ts`: `targetMinutes = targetHours * 60;` implies input `targetHours` is in hours.
            // And it comes from `times.main` which comes from DB `hltbMain` (via `adjustedHltbTimes`).
            // So the code EXPECTS `hltbMain` to be in HOURS (e.g., 10).
            // But the SCHEMA COMMENT says "En minutes".
            // Trust the CODE (format-utils) over the COMMENT, or update consistency?
            // If I store minutes (600), format-utils will do 600 * 60 = 36000 minutes target. That's wrong.
            // So I must store HOURS.

            dataToUpdate.hltbMain = Math.round(bestMatch.gameplayMain);
            dataToUpdate.hltbExtra = Math.round(bestMatch.gameplayMainExtra);
            dataToUpdate.hltbCompletionist = Math.round(bestMatch.gameplayCompletionist);

            // Store full times object as JSON if needed by frontend
            dataToUpdate.hltbTimes = JSON.stringify({
                main: bestMatch.gameplayMain,
                extra: bestMatch.gameplayMainExtra,
                completionist: bestMatch.gameplayCompletionist,
                id: bestMatch.id,
                name: bestMatch.name
            });
        }
    } catch (error) {
        console.error("HLTB Error:", error);
        // Continue, don't fail just because HLTB failed
    }

    dataToUpdate.dataMissing = false;
    dataToUpdate.dataFetched = true;

    // 3. Update Database
    await prisma.game.update({
        where: { id: gameId },
        data: dataToUpdate,
    });

    revalidatePath('/dashboard');
    return { success: true, message: 'Game enriched successfully' };

  } catch (error) {
    console.error('Enrichment failed:', error);
    return { success: false, message: 'Enrichment failed' };
  }
}
