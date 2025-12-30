import './env-loader';
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames, getIgdbImageUrl, getIgdbTimeToBeat, IgdbGame, EnrichedIgdbGame } from '../lib/igdb';
import { searchHowLongToBeat } from '../lib/hltb';

const prisma = new PrismaClient();
const DELAY_MS = 1000;

interface HltbResultRow {
    Title: string;
    Status: string;
    Main: string;
    Extra: string;
    Complete: string;
}

async function runHltbOnly() {
    console.log("⏱️  HLTB Enrichment Only Mode...");

    const games = await prisma.game.findMany({
        where: {
            OR: [
                { hltbMain: null },
                { hltbMain: 0 }
            ]
        },
        take: 20,
        orderBy: { updatedAt: 'desc' }
    });

    if (games.length === 0) {
        console.log("No games found needing HLTB update.");
        return;
    }

    console.log(`Checking ${games.length} games for HLTB data...`);
    const tableData: HltbResultRow[] = [];

    for (const game of games) {
        console.log(`\n🔍 Searching: ${game.title}`);
        try {
            const hltb = await searchHowLongToBeat(game.title);

            if (hltb) {
                console.log(`   ✅ Found: ${hltb.main}m / ${hltb.extra}m / ${hltb.completionist}m`);

                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        hltbMain: hltb.main,
                        hltbExtra: hltb.extra,
                        hltbCompletionist: hltb.completionist
                    }
                });

                tableData.push({
                    Title: game.title,
                    Status: 'Updated',
                    Main: `${hltb.main} min`,
                    Extra: `${hltb.extra} min`,
                    Complete: `${hltb.completionist} min`
                });

            } else {
                console.log(`   ❌ Not found.`);
                tableData.push({
                    Title: game.title,
                    Status: 'Not Found',
                    Main: '-',
                    Extra: '-',
                    Complete: '-'
                });
            }
        } catch (error) {
            console.error(`   ⚠️ Error processing ${game.title}:`, error);
        }
        await new Promise(r => setTimeout(r, 2000)); // 2s delay for HLTB safety
    }

    console.log("\n\n📊 Enrichment Results:");
    console.table(tableData);
}

async function runFullEnrichment() {
    console.log("🎨 Enrichissement Avancé (Media + Métadonnées)...");

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

        const art = await findBestGameArt(game.title, releaseYear);
        let igdbData: EnrichedIgdbGame | IgdbGame | null = null;

        if (art) {
            console.log(`   ✅ Images trouvées via [${art.source.toUpperCase()}]`);
            if (art.source === 'igdb' && art.originalData) {
                igdbData = art.originalData as EnrichedIgdbGame;
            }
        } else {
            console.log(`   ❌ Aucun match strict trouvé pour les images.`);
        }

        if (!igdbData) {
            try {
                const igdbResults = await searchIgdbGames(game.title, 1);
                if (igdbResults.length > 0) {
                    const candidate = igdbResults[0];
                    const candidateYear = candidate.first_release_date ? new Date(candidate.first_release_date * 1000).getFullYear() : null;
                    if (!releaseYear || !candidateYear || Math.abs(releaseYear - candidateYear) <= 1) {
                        igdbData = candidate;
                        console.log(`   ✅ Données IGDB trouvées séparément.`);
                    }
                }
            } catch (e) {
                console.error(`   ❌ Erreur recherche IGDB:`, e);
            }
        }

        const updateData: any = {};

        if (art) {
            if (!game.coverImage && art.cover) updateData.coverImage = art.cover;
            if (!game.backgroundImage && art.background) updateData.backgroundImage = art.background;
        }

        if (igdbData) {
            if ((!game.description || game.description === "") && igdbData.summary) {
                updateData.description = igdbData.summary;
            }

            if (!game.igdbId) {
                const newIgdbId = String(igdbData.id);
                const existing = await prisma.game.findUnique({
                    where: { igdbId: newIgdbId },
                    select: { id: true, title: true }
                });

                if (existing && existing.id !== game.id) {
                    console.warn(`   ⚠️ IGDB ID collision: ${newIgdbId} used by "${existing.title}". Skipping ID update.`);
                } else {
                    updateData.igdbId = newIgdbId;
                }
            }

            const score = igdbData.total_rating || igdbData.aggregated_rating;
            if (!game.igdbScore && score) {
                updateData.igdbScore = Math.round(score);
            }

            if (!game.igdbUrl && igdbData.url) {
                updateData.igdbUrl = igdbData.url;
            }

            if (igdbData.screenshots && igdbData.screenshots.length > 0) {
                const screens = igdbData.screenshots.map(s => getIgdbImageUrl(s.image_id, '1080p'));
                updateData.screenshots = screens;
            }

            if (igdbData.videos && igdbData.videos.length > 0) {
                const videos = igdbData.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`);
                updateData.videos = videos;
            }

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

        if (Object.keys(updateData).length > 0) {
            updateData.dataFetched = true;
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

async function main() {
    const args = process.argv.slice(2);
    if (args.includes('--hltb-only')) {
        await runHltbOnly();
    } else {
        await runFullEnrichment();
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
