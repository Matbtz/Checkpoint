'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export type FilterOptions = {
    genres: string[];
    platforms: string[];
};

export async function getFilterOptions(): Promise<FilterOptions> {
    // Note: We deliberately allow unauthenticated users to see filter options
    // as the game database is public information.

    // Fetch all games to count stats
    // We fetch everything because we want global stats for the filter list,
    // not just the user's library stats (though in this app 'Game' table is shared,
    // so it represents all known games).
    const games = await prisma.game.findMany({
        select: {
            genres: true,
            platforms: true,
        },
    });

    const genreCounts = new Map<string, number>();
    const platformCounts = new Map<string, number>();

    for (const game of games) {
        // Parse Genres
        if (game.genres && typeof game.genres === 'string') {
            try {
                const parsed = JSON.parse(game.genres);
                if (Array.isArray(parsed)) {
                    parsed.forEach((g: string) => {
                        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
                    });
                }
            } catch (e) {
                // ignore
            }
        }

        // Parse Platforms
        if (game.platforms && Array.isArray(game.platforms)) {
             game.platforms.forEach((p: any) => {
                let name = '';
                if (typeof p === 'string') {
                    name = p;
                } else if (p && typeof p === 'object' && p.name) {
                    name = p.name;
                }

                if (name) {
                    platformCounts.set(name, (platformCounts.get(name) || 0) + 1);
                }
             });
        }
    }

    // Sort by count descending
    const sortedGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

    const sortedPlatforms = Array.from(platformCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);

    // Fallback lists
    const commonGenres = [
        "Action", "Adventure", "RPG", "Shooter", "Strategy", "Sports",
        "Racing", "Fighting", "Platform", "Puzzle", "Simulation", "Indie"
    ];
    const commonPlatforms = [
        "PC", "PlayStation 5", "PlayStation 4", "Xbox Series X", "Xbox One",
        "Nintendo Switch", "Mac", "Linux", "iOS", "Android"
    ];

    // Append common ones if not present (to ensure options exist for new users)
    commonGenres.forEach(g => {
        if (!genreCounts.has(g)) {
            sortedGenres.push(g);
        }
    });

    commonPlatforms.forEach(p => {
        if (!platformCounts.has(p)) {
            sortedPlatforms.push(p);
        }
    });

    return {
        genres: sortedGenres,
        platforms: sortedPlatforms,
    };
}
