'use server';

import { searchRawgGames, getRawgGameDetails } from '@/lib/rawg';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function searchGamesAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    return await searchRawgGames(query);
}

export async function addGameById(gameId: number) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // 1. Check if game exists in DB
    let game = await prisma.game.findUnique({
        where: { id: String(gameId) },
    });

    if (!game) {
        // 2. Fetch details from RAWG
        const details = await getRawgGameDetails(gameId);
        if (!details) {
            throw new Error("Game not found on RAWG");
        }

        // 3. Create game in DB
        game = await prisma.game.create({
            data: {
                id: String(details.id),
                title: details.name,
                coverImage: details.background_image,
                releaseDate: details.released ? new Date(details.released) : null,
                genres: JSON.stringify(details.genres.map((g: { name: any; }) => g.name)),
                dataMissing: true // Flag for enrichment
            }
        });
    }

    // 4. Add to user library
    const existingEntry = await prisma.userLibrary.findUnique({
        where: {
            userId_gameId: {
                userId: session.user.id,
                gameId: game.id
            }
        }
    });

    if (existingEntry) {
        throw new Error("Game already in library");
    }

    await prisma.userLibrary.create({
        data: {
            userId: session.user.id,
            gameId: game.id,
            status: 'Backlog',
        }
    });

    revalidatePath('/dashboard');
    return game;
}
