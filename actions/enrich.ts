'use server';

import { enrichGame, enrichAllMissingGames } from '@/lib/enrichment';
import { auth } from '@/auth';

export async function enrichGameAction(gameId: string) {
    const session = await auth();
    if (!session) {
        throw new Error('Not authenticated');
    }
    return await enrichGame(gameId);
}

export async function enrichLibraryAction() {
    const session = await auth();
    if (!session) {
        throw new Error('Not authenticated');
    }
    // Trigger batch enrichment
    // In a real app, this should probably be a background job.
    // For now, we process a small batch and return.
    return await enrichAllMissingGames();
}
