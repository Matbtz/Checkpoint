'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export type FilterOptions = {
    genres: string[];
    platforms: string[];
};

export async function getFilterOptions(): Promise<FilterOptions> {
    const session = await auth();
    if (!session?.user?.id) return { genres: [], platforms: [] };

    const games = await prisma.game.findMany({
        select: {
            genres: true,
            platforms: true,
        },
    });

    const genreSet = new Set<string>();
    const platformSet = new Set<string>();

    for (const game of games) {
        // Parse Genres
        if (game.genres && typeof game.genres === 'string') {
            try {
                const parsed = JSON.parse(game.genres);
                if (Array.isArray(parsed)) {
                    parsed.forEach((g: string) => genreSet.add(g));
                }
            } catch (e) {
                // ignore
            }
        }

        // Parse Platforms
        if (game.platforms && Array.isArray(game.platforms)) {
             game.platforms.forEach((p: any) => {
                if (typeof p === 'string') {
                    platformSet.add(p);
                } else if (p && typeof p === 'object' && p.name) {
                    platformSet.add(p.name);
                }
             });
        }
    }

    return {
        genres: Array.from(genreSet).sort(),
        platforms: Array.from(platformSet).sort(),
    };
}
