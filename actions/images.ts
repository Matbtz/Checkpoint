"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

import { findBestGameArt } from "@/lib/enrichment";
import { revalidatePath } from "next/cache";

export async function fixBrokenImage(gameId: string, type: 'COVER' | 'BACKGROUND') {
    try {
        console.log(`[AutoFix] Attempting to fix broken ${type} for Game ID ${gameId}...`);

        const game = await prisma.game.findUnique({
            where: { id: gameId },
            select: { id: true, title: true, releaseDate: true, coverImage: true, backgroundImage: true, imageStatus: true, updatedAt: true }
        });

        if (!game) return { success: false, message: 'Game not found' };

        // Cooldown check: Don't retry fixing broken images too often (prevent loops)
        if (game.imageStatus === 'BROKEN') {
            const timeSinceUpdate = new Date().getTime() - new Date(game.updatedAt).getTime();
            if (timeSinceUpdate < 5 * 60 * 1000) { // 5 minutes cooldown
                console.log(`[AutoFix] Cooldown active for ${game.title}. Skipping.`);
                return { success: false, message: 'Cooldown active' };
            }
        }

        // Determine current broken URL to avoid re-selecting it (simple check)
        const brokenUrl = type === 'COVER' ? game.coverImage : game.backgroundImage;

        const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

        // Try to find best art again
        // We can exclude the source if we knew where it came from, but we don't store source per image url easily.
        // However, findBestGameArt does a cascade.
        // Let's try to find a NEW one. 
        const bestArt = await findBestGameArt(game.title, releaseYear);

        if (bestArt) {
            let newUrl = type === 'COVER' ? bestArt.cover : bestArt.background;

            // Fallback if the specific type wasn't found in bestArt (rare, but possible)
            if (!newUrl && type === 'COVER') newUrl = bestArt.background; // Use background as cover fallback? Maybe.

            // Check if it's different from the broken one
            if (newUrl && newUrl !== brokenUrl) {
                console.log(`[AutoFix] Found new image for ${game.title}: ${newUrl}`);

                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        [type === 'COVER' ? 'coverImage' : 'backgroundImage']: newUrl,
                        imageStatus: 'OK', // Reset status
                        updatedAt: new Date()
                    }
                });

                revalidatePath('/');
                revalidatePath('/library');
                revalidatePath(`/game/${gameId}`);

                return { success: true, newUrl };
            }
        }

        // If we couldn't find a better one, mark strictly as BROKEN so we don't retry locally indefinitely if we implemented a retry logic.
        // But for now, just logging.
        console.log(`[AutoFix] Could not find better image for ${game.title}`);

        // Mark as broken in DB so we can filter/query them later
        await prisma.game.update({
            where: { id: gameId },
            data: { imageStatus: 'BROKEN' }
        });

        return { success: false, message: 'No replacement found' };

    } catch (error) {
        console.error("[AutoFix] Failed:", error);
        return { success: false, error };
    }
}
