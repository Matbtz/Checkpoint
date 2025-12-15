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

        // Description: rawgData.description_raw
        if (g.description_raw || g.description) {
            dataToUpdate.description = g.description_raw || g.description;
        }

        // CoverUrl: rawgData.background_image
        if (g.background_image) {
            dataToUpdate.backgroundImage = g.background_image;
            dataToUpdate.coverImage = g.background_image;
        }

        // Genres: rawgData.genres.map((g: any) => g.name).join(", ")
        if (g.genres) {
            dataToUpdate.genres = g.genres.map((gen: any) => gen.name).join(", ");
        }

        // ReleaseDate: new Date(rawgData.released)
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
