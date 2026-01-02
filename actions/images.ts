"use server";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";

export async function reportBrokenImage(gameId: string, type: 'COVER' | 'BACKGROUND') {
    // Optional: Check authentication to prevent public spam abuse, though broken images can be seen by public.
    // We'll allow it but rate limit or just trust for now since it's a small app.
    // Ideally, valid session required if app is private. 
    // For now let's just proceed.

    try {
        // Check if game exists
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            select: { id: true, imageStatus: true }
        });

        if (!game) return;

        // Only update if not already broken
        if (game.imageStatus !== 'BROKEN') {
            await prisma.game.update({
                where: { id: gameId },
                data: {
                    imageStatus: 'BROKEN'
                }
            });
            console.log(`[Broken Image] Reported for Game ID ${gameId} (${type})`);
        }

    } catch (error) {
        console.error("[Broken Image] Failed to report:", error);
    }
}
