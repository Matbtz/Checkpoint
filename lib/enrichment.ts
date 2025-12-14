import { prisma } from './db';
import { searchRawgGame } from './rawg';
import { searchHltb } from './hltb';

export async function enrichGame(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    throw new Error('Game not found');
  }

  console.log(`Enriching game: ${game.title}`);

  let updated = false;
  let dataMissing = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  // 1. RAWG Enrichment (Visuals, Genres, Scores)
  // We use the title to search. If we had an external ID mapping, it would be better.
  try {
    const rawgResult = await searchRawgGame(game.title);
    if (rawgResult) {
      // Fetch full details if needed, but search result often has what we need
      // If we need description, we might need detail call.
      // Search result has: name, released, background_image, genres, rating

      if (!game.coverImage && rawgResult.background_image) {
        updateData.coverImage = rawgResult.background_image;
        updated = true;
      }

      if (!game.releaseDate && rawgResult.released) {
        updateData.releaseDate = new Date(rawgResult.released);
        updated = true;
      }

      if (!game.genres && rawgResult.genres) {
        updateData.genres = JSON.stringify(rawgResult.genres.map(g => g.name));
        updated = true;
      }

      if (!game.scores) {
        const scores = {
           rawg: rawgResult.rating,
           metacritic: rawgResult.metacritic
        };
        updateData.scores = JSON.stringify(scores);
        updated = true;
      }
    } else {
        console.log(`RAWG not found for ${game.title}`);
        // If we really depend on RAWG for visual, we might mark dataMissing,
        // but maybe we have Steam image? Steam import sets title.
        // Steam doesn't set coverImage in our current import (it might in the future).
    }
  } catch (e) {
    console.error('RAWG Enrichment failed', e);
  }

  // 2. HLTB Enrichment
  try {
    const hltbResult = await searchHltb(game.title);
    if (hltbResult) {
      updateData.hltbTimes = JSON.stringify(hltbResult);
      updated = true;
    } else {
      console.log(`HLTB not found for ${game.title}`);
      dataMissing = true;
    }
  } catch (e) {
    console.error('HLTB Enrichment failed', e);
    dataMissing = true;
  }

  // Update DB
  // If dataMissing is true, we should update it so we know we tried.
  // If updated is true, we have new data.
  // We also want to update 'updatedAt' to avoid immediate retry if nothing changed but we want to mark it processed.
  if (updated || dataMissing !== game.dataMissing) {
    updateData.dataMissing = dataMissing;
    await prisma.game.update({
      where: { id: gameId },
      data: updateData,
    });
  } else if (!updated && !dataMissing && game.dataMissing === false) {
      // If nothing updated and not missing, but we ran the check, maybe we should mark it?
      // Actually, if we found nothing but didn't error, it's weird.
      // But let's say we want to avoid re-checking too often.
      // The schema has updatedAt @updatedAt, so just touching it updates the timestamp.
      // However, for the 'enrichAllMissingGames' loop, we filter by OR(hltbTimes: null, coverImage: null) AND dataMissing: false.
      // If we found nothing, we should probably set dataMissing = true to stop the loop.

      // If RAWG returned nothing and HLTB returned nothing, dataMissing would be true (from HLTB check) or false?
      // HLTB check sets dataMissing=true if not found.
      // RAWG check just logs. If RAWG fails, we might still want to flag it?
      // For now, if HLTB fails, dataMissing is true.
  }

  return { success: true, updated, dataMissing };
}

export async function enrichAllMissingGames() {
    // Find games that have no HLTB times or no cover image
    // Limit to avoid rate limits
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { hltbTimes: null },
                { coverImage: null }
            ],
            dataMissing: false
        },
        orderBy: {
            updatedAt: 'asc' // Process oldest checked first
        },
        take: 5 // Process in small batches
    });

    const results = [];
    for (const game of games) {
        results.push(await enrichGame(game.id));
        // Add delay to respect API limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return results;
}
