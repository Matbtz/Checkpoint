import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames, getIgdbImageUrl, getIgdbTimeToBeat, IgdbGame, EnrichedIgdbGame } from '../lib/igdb';

const prisma = new PrismaClient();
const DELAY_MS = 1000;

async function main() {
    console.log("🎨 Enrichissement Avancé (Media + Métadonnées)...");

    // On cible les jeux avec des données manquantes
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { coverImage: null },
                { backgroundImage: null },
                { description: null },
                { description: "" }
            ]
        }
    });

    console.log(`Traitement de ${games.length} jeux...`);

    for (const game of games) {
        const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

        console.log(`\n🔍 ${game.title} (${releaseYear || '?'})`);

        // 1. Récupération des images (Art)
        // Appel de la nouvelle fonction "Best Match"
        const art = await findBestGameArt(game.title, releaseYear);

        let igdbData: EnrichedIgdbGame | IgdbGame | null = null;

        if (art) {
            console.log(`   ✅ Images trouvées via [${art.source.toUpperCase()}]`);
            // Si la source est IGDB, on a déjà les données via findBestGameArt qui retourne originalData
            if (art.source === 'igdb' && art.originalData) {
                igdbData = art.originalData as EnrichedIgdbGame;
            }
        } else {
            console.log(`   ❌ Aucun match strict trouvé pour les images.`);
        }

        // 2. Si on n'a pas encore les données IGDB (parce que la source était Steam/RAWG ou pas de match),
        // on cherche explicitement sur IGDB pour récupérer les métadonnées manquantes
        if (!igdbData) {
            try {
                // On limite à 1 résultat pour trouver le meilleur match
                const igdbResults = await searchIgdbGames(game.title, 1);
                if (igdbResults.length > 0) {
                    const candidate = igdbResults[0];
                    const candidateYear = candidate.first_release_date ? new Date(candidate.first_release_date * 1000).getFullYear() : null;

                    // Tolérance d'année si disponible
                    if (!releaseYear || !candidateYear || Math.abs(releaseYear - candidateYear) <= 1) {
                        igdbData = candidate;
                        console.log(`   ✅ Données IGDB trouvées séparément.`);
                    }
                }
            } catch (e) {
                console.error(`   ❌ Erreur recherche IGDB:`, e);
            }
        }

        // 3. Préparation des données à mettre à jour
        const updateData: any = {};

        // Images (Priorité Art)
        if (art) {
            if (!game.coverImage && art.cover) updateData.coverImage = art.cover;
            if (!game.backgroundImage && art.background) updateData.backgroundImage = art.background;
        }

        // Données IGDB (Complément)
        if (igdbData) {
            // Description
            if ((!game.description || game.description === "") && igdbData.summary) {
                updateData.description = igdbData.summary;
            }

            // IGDB ID
            if (!game.igdbId) {
                updateData.igdbId = String(igdbData.id);
            }

            // IGDB Score
            // Utilise total_rating (Critic + User) ou aggregated_rating (Critic)
            const score = igdbData.total_rating || igdbData.aggregated_rating;
            if (!game.igdbScore && score) {
                updateData.igdbScore = Math.round(score);
            }

            // IGDB URL
            if (!game.igdbUrl && igdbData.url) {
                updateData.igdbUrl = igdbData.url;
            }

            // Screenshots
            if (igdbData.screenshots && igdbData.screenshots.length > 0) {
                // On écrase les screenshots existants pour avoir ceux de haute qualité IGDB
                const screens = igdbData.screenshots.map(s => getIgdbImageUrl(s.image_id, '1080p'));
                updateData.screenshots = screens;
            }

            // Videos (Trailers)
            if (igdbData.videos && igdbData.videos.length > 0) {
                const videos = igdbData.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`);
                updateData.videos = videos;
            }

            // Time To Beat (IGDB Time)
            // On fait un appel supplémentaire si on a l'ID IGDB
            try {
                const timeData = await getIgdbTimeToBeat(igdbData.id);
                if (timeData) {
                    updateData.igdbTime = {
                        hastly: timeData.hastly,
                        normally: timeData.normally,
                        completely: timeData.completely
                    };
                    console.log(`   ⏱️ TimeToBeat récupéré.`);
                }
            } catch (e) {
                console.error(`   ❌ Erreur TimeToBeat:`, e);
            }
        }

        // 4. Update DB if there is data
        if (Object.keys(updateData).length > 0) {
            updateData.dataFetched = true; // Mark as fetched
            await prisma.game.update({
                where: { id: game.id },
                data: updateData
            });
            console.log(`   💾 Mise à jour effectuée : ${Object.keys(updateData).join(', ')}`);
        } else {
            console.log(`   ⏺️ Aucune nouvelle donnée pertinente.`);
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
