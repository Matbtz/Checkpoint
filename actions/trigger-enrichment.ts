'use server';

import { enrichGameData } from '@/actions/enrich';
import { revalidatePath } from 'next/cache';

export async function triggerEnrichmentAction(gameId: string, gameTitle: string) {
  // This is a wrapper to call the existing enrichment action and revalidate the page.
  await enrichGameData(gameId, gameTitle);
  revalidatePath(`/game/${gameId}`);
}
