'use server';

import { searchGamesEnriched, EnrichedGameData } from '@/lib/enrichment';
import { getOpenCriticScore } from '@/lib/opencritic';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { searchLocalGames, searchOnlineGames } from './search';

// New actions for Split Search
export async function searchLocalAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    return await searchLocalGames(query);
}

export async function searchOnlineAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    return await searchOnlineGames(query);
}

export async function searchGamesAction(query: string, provider: 'igdb' | 'rawg' = 'rawg') {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    return await searchGamesEnriched(query, provider);
}

export interface AddGamePayload {
    id: string;
    title: string;
    coverImage: string;
    backgroundImage?: string;
    releaseDate?: string | null;
    studio?: string;
    metacritic?: number;
    opencritic?: number | null; // Added
    source: 'igdb' | 'rawg';
    genres?: string[];
}

export async function addGameExtended(payload: AddGamePayload) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // 1. Check if game exists in DB
    let game = await prisma.game.findUnique({
        where: { id: payload.id },
    });

    if (!game) {
        // Fetch OpenCritic score if not provided/available
        let opencriticScore = payload.opencritic;
        if (opencriticScore === undefined && payload.source === 'igdb') {
             // Fetch specifically for new IGDB games
             opencriticScore = await getOpenCriticScore(payload.title);
        }

        // 2. Create game in DB with provided enriched data
        game = await prisma.game.create({
            data: {
                id: payload.id,
                igdbId: payload.source === 'igdb' ? payload.id : undefined, // Ensure igdbId is set if source is IGDB
                title: payload.title,
                coverImage: payload.coverImage,
                backgroundImage: payload.backgroundImage,
                releaseDate: payload.releaseDate ? new Date(payload.releaseDate) : null,
                studio: payload.studio,
                metacritic: payload.metacritic,
                opencritic: opencriticScore,
                genres: payload.genres ? JSON.stringify(payload.genres) : undefined,
                dataMissing: true // Still flag for deeper enrichment if needed (e.g. HLTB)
            }
        });
    } else {
        // Update existing game with better metadata if available and not set?
        // For now, let's just ensure studio/metacritic are set if missing
        if (!game.studio && payload.studio) {
            await prisma.game.update({
                where: { id: payload.id },
                data: { studio: payload.studio }
            });
        }
    }

    // 3. Add to user library
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
            status: 'BACKLOG', // Match default consistent with Schema
        }
    });

    revalidatePath('/dashboard');
    return game;
}
