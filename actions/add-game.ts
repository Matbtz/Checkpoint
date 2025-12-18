'use server';

import { searchIgdbGames, getIgdbImageUrl } from '@/lib/igdb';
// IMPORT CRUCIAL : C'est ici qu'on branche votre fichier existant
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
// Cette action remplace l'appel par défaut
export async function searchLocalGamesAction(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const games = await prisma.game.findMany({
        where: { title: { contains: query, mode: 'insensitive' } },
        take: 10
    });

    return games.map(g => ({
        id: g.id,
        title: g.title,
        coverImage: g.coverImage,
        releaseDate: g.releaseDate?.toISOString() ?? null,
        studio: g.studio,
        metacritic: g.metacritic,
        opencritic: g.opencritic, // <--- On renvoie le score stocké
        source: 'local' as const,
        availableCovers: g.coverImage ? [g.coverImage] : [],
        availableBackgrounds: g.backgroundImage ? [g.backgroundImage] : []
    }));
}

// --- ACTION 2 : RECHERCHE ONLINE (IGDB) ---
// À n'appeler QUE via le bouton "Étendre"
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

        // ... (Logique images inchangée) ...
        const availableCovers: string[] = [];
        if (game.cover) availableCovers.push(getIgdbImageUrl(game.cover.image_id, 'cover_big'));

        return {
            id: String(game.id),
            title: game.name,
            releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : null,
            studio: game.involved_companies?.find(c => c.developer)?.company.name || null,
            metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
            opencritic: existing?.opencritic || null, // On ne fetch PAS OpenCritic ici sauf si déjà en cache
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
                // ... autres champs
                metacritic: payload.metacritic,
                opencritic: openCriticScore, // <--- Sauvegarde en base
                // ...
            }
        });
    }

    // ... reste de la logique d'ajout à la librairie ...

    revalidatePath('/dashboard');
    return game;
}
