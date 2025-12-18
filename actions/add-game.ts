'use server';

import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
// IMPORT CRUCIAL : C'est ici qu'on branche votre fichier existant
import { getOpenCriticScore } from '@/lib/opencritic';
import { EnrichedGameData } from '@/lib/enrichment';
import { prisma } from '@/lib/db';
import { Game } from '@prisma/client';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export interface AddGamePayload {
    id: string;
    title: string;
    coverImage: string;
    backgroundImage?: string;
    releaseDate: string | null;
    studio?: string;
    genres: string[];
    platforms?: string[];
    metacritic?: number | null;
    opencritic?: number | null;
    source: 'igdb' | 'rawg' | 'manual' | 'local';
    originalData?: any;
}

// --- ACTION 1 : RECHERCHE LOCALE (Gratuite) ---
// Cette action remplace l'appel par défaut
// --- ACTION 1 : RECHERCHE LOCALE (Gratuite) ---
export async function searchLocalGamesAction(query: string): Promise<EnrichedGameData[]> {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const games = await prisma.game.findMany({
        where: { title: { contains: query, mode: 'insensitive' } },
        take: 10
    });

    return games.map((g: Game) => {
        let parsedGenres: string[] = [];
        try {
            parsedGenres = g.genres ? JSON.parse(g.genres) : [];
            if (!Array.isArray(parsedGenres)) parsedGenres = [];
        } catch (e) {
            // fallback if not valid json
            parsedGenres = [];
        }

        return {
            id: g.id,
            title: g.title,
            coverImage: g.coverImage, // Note: EnrichedGameData doesn't have 'coverImage' at root in interface? checking... wait, EnrichedGameData has availableCovers. 
            // The interface in enrichment.ts shows: id, title, releaseDate, studio, metacritic, opencritic, genres, platforms, availableCovers, availableBackgrounds, source, originalData
            // It does NOT have single 'coverImage' property in the interface shown in step 24's view_file output.
            // Wait, looking at step 24 output: 
            // export interface EnrichedGameData { id: string; title: string; releaseDate: string | null; studio: string | null; metacritic: number | null; ... availableCovers: string[]; ... }
            // So I need to map correctly.

            releaseDate: g.releaseDate?.toISOString() ?? null,
            studio: g.studio,
            metacritic: g.metacritic,
            opencritic: g.opencritic,
            genres: parsedGenres,
            platforms: [], // Local games schema might not have platforms yet unless I missed it. Assuming empty for now.
            availableCovers: g.coverImage ? [g.coverImage] : [],
            availableBackgrounds: g.backgroundImage ? [g.backgroundImage] : [],
            source: 'local',
            originalData: null
        };
    });
}

// --- ACTION 2 : RECHERCHE ONLINE (IGDB) ---
// À n'appeler QUE via le bouton "Étendre"
// --- ACTION 2 : RECHERCHE ONLINE (IGDB) ---
export async function searchOnlineGamesAction(query: string): Promise<EnrichedGameData[]> {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Appel IGDB
    const igdbResults = await searchIgdbGames(query, 10);

    // On vérifie si on a déjà les scores en local pour ces jeux
    const igdbIds = igdbResults.map(g => String(g.id));
    const existingGames = await prisma.game.findMany({
        where: { id: { in: igdbIds } },
        select: { id: true, opencritic: true }
    });

    return igdbResults.map(game => {
        const existing = existingGames.find((e: { id: string; opencritic: number | null }) => e.id === String(game.id));

        const availableCovers: string[] = [];
        if (game.cover) availableCovers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));

        // RECUPERATION DES BACKGROUNDS (Screenshots + Artworks)
        const availableBackgrounds: string[] = [];
        if (game.screenshots) {
            game.screenshots.forEach(s => availableBackgrounds.push(getIgdbImageUrl(s.image_id, '1080p')));
        }
        if (game.artworks) {
            game.artworks.forEach(a => availableBackgrounds.push(getIgdbImageUrl(a.image_id, '1080p')));
        }

        return {
            id: String(game.id),
            title: game.name,
            releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : null,
            studio: game.involved_companies?.find(c => c.developer)?.company.name || null,
            metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
            opencritic: existing?.opencritic || null,
            genres: game.genres?.map(g => g.name) || [],
            platforms: game.platforms?.map(p => p.name) || [],
            availableCovers,
            availableBackgrounds,
            source: 'igdb',
            originalData: game
        };
    });
}

// --- ACTION 3 : AJOUT (Le paiement API) ---
// --- ACTION 3 : AJOUT (Le paiement API) ---
export async function addGameExtended(payload: AddGamePayload) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    let game = await prisma.game.findUnique({ where: { id: payload.id } });

    // Si le jeu n'existe pas, C'EST LE MOMENT d'appeler OpenCritic
    if (!game) {
        let openCriticScore = null;
        try {
            // APPEL DU FICHIER OPENCRITIC.TS
            openCriticScore = await getOpenCriticScore(payload.title);
        } catch (e) {
            console.error("OpenCritic Fetch Error:", e);
        }

        game = await prisma.game.create({
            data: {
                id: payload.id,
                title: payload.title,
                coverImage: payload.coverImage,
                backgroundImage: payload.backgroundImage, // Sauvegarde du background
                releaseDate: payload.releaseDate,
                studio: payload.studio,
                genres: JSON.stringify(payload.genres), // Sauvegarde des genres (JSON string selon schema)
                metacritic: payload.metacritic,
                opencritic: openCriticScore ?? payload.opencritic, // Priorité au fetch frais, sinon payload
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
