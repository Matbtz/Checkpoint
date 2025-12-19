'use server';

import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
import { getOpenCriticScore } from '@/lib/opencritic';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// --- UTILITAIRE : FETCH OPENCRITIC ON DEMAND ---
export async function fetchOpenCriticAction(title: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    return await getOpenCriticScore(title);
}

// --- ACTION 1 : RECHERCHE LOCALE (Gratuite) ---
export async function searchLocalGamesAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Split query by spaces to handle multiple words (e.g. "divinity sin" should match "Divinity: Original Sin")
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);

    // Create an AND condition for each term
    const whereCondition = terms.length > 0 ? {
        AND: terms.map(term => ({
            title: { contains: term, mode: 'insensitive' as const }
        }))
    } : {};

    const games = await prisma.game.findMany({
        where: whereCondition,
        take: 10
    });

    return games.map(g => ({
        id: g.id,
        title: g.title,
        coverImage: g.coverImage,
        releaseDate: g.releaseDate?.toISOString() ?? null,
        studio: g.studio,
        metacritic: g.metacritic,
        opencritic: g.opencritic,
        source: 'local' as const,
        availableCovers: g.coverImage ? [g.coverImage] : [],
        availableBackgrounds: g.backgroundImage ? [g.backgroundImage] : [],
        genres: g.genres ? JSON.parse(g.genres as string) : [],
        platforms: [], // Champ non stocké en BDD pour l'instant
        description: g.description,
        originalData: null
    }));
}

// --- ACTION 2 : RECHERCHE ONLINE (IGDB) ---
export async function searchOnlineGamesAction(query: string) {
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
        const existing = existingGames.find(e => e.id === String(game.id));

        const availableCovers: string[] = [];
        if (game.cover) availableCovers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));

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
            availableBackgrounds: game.possibleBackgrounds || [],
            source: 'igdb' as const,
            originalData: game,
            description: game.summary
        };
    });
}

// --- ACTION 3 : AJOUT (Le paiement API) ---
export async function addGameExtended(payload: any) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    let game = await prisma.game.findUnique({ where: { id: payload.id } });

    // Si le jeu n'existe pas, on le crée
    if (!game) {
        // Priorité au score passé par le frontend (payload.opencritic)
        // Sinon, on tente de le fetcher
        let openCriticScore = payload.opencritic;

        if (openCriticScore === undefined || openCriticScore === null) {
             try {
                openCriticScore = await getOpenCriticScore(payload.title);
            } catch (e) {
                console.error("OpenCritic Fetch Error:", e);
            }
        }

        game = await prisma.game.create({
            data: {
                id: payload.id,
                title: payload.title,
                coverImage: payload.coverImage,
                backgroundImage: payload.backgroundImage,
                releaseDate: payload.releaseDate ? new Date(payload.releaseDate) : null,
                studio: payload.studio,
                metacritic: payload.metacritic, // Score affiché (choisi par l'utilisateur)
                opencritic: openCriticScore, // Score réel OpenCritic
                genres: payload.genres, // Stringified JSON
                // platforms: payload.platforms, // Pas de colonne platforms dans le schéma Game
                description: payload.description,
                // source: payload.source, // Pas de colonne source dans le schéma Game
                dataFetched: true,
                lastSync: new Date()
            }
        });
    }

    // Ajout à la librairie de l'utilisateur
    // On vérifie s'il l'a déjà pour éviter les doublons/erreurs
    const existingEntry = await prisma.userLibrary.findFirst({
        where: {
            userId: session.user.id,
            gameId: game.id
        }
    });

    if (!existingEntry) {
        await prisma.userLibrary.create({
            data: {
                userId: session.user.id,
                gameId: game.id,
                status: 'BACKLOG',
                createdAt: new Date(),
                playtimeManual: 0,
                progressManual: 0
            }
        });
    }

    revalidatePath('/dashboard');
    return game;
}
