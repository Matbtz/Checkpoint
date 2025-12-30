
import './env-loader';
import { PrismaClient } from '@prisma/client';
import { searchSteamStore, getSteamReviewStats } from '../lib/steam-store';
import { stringSimilarity } from '../lib/utils';

const prisma = new PrismaClient();
const DELAY_MS = 1000;

function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// Reuse logic from enrichment.ts but optimized for Steam context
function isMatch(localTitle: string, steamName: string, localDate: Date | null, steamYear: number | null): boolean {
    const nLocal = normalize(localTitle);
    const nSteam = normalize(steamName);

    // Strict Title Check
    const dist = stringSimilarity(nLocal, nSteam);
    const titleMatch = dist >= 0.85 || nLocal.includes(nSteam) || nSteam.includes(nLocal);

    if (!titleMatch) return false;

    // Date Check (if both available)
    if (localDate && steamYear) {
        const localYear = localDate.getFullYear();
        return Math.abs(localYear - steamYear) <= 1;
    }

    return true;
}

async function main() {
    console.log("🚂 Enrichissement Steam (Reviews, URLs, IDs)...");

    // Targets: Missing Steam ID OR Missing Review Data (where ID is known or unknown)
    const games = await prisma.game.findMany({
        where: {
            OR: [
                { steamAppId: null },
                { steamReviewScore: null }
            ]
        },
        select: {
            id: true,
            title: true,
            releaseDate: true,
            steamAppId: true
        }
    });

    console.log(`🎯 Cibles identifiées: ${games.length} jeux.`);
    let updatedCount = 0;

    for (const game of games) {
        let steamId = game.steamAppId ? parseInt(game.steamAppId) : null;
        let foundNewId = false;

        // 1. Find ID if missing
        if (!steamId) {
            try {
                const results = await searchSteamStore(game.title);
                const match = results.find(r => isMatch(game.title, r.name, game.releaseDate, r.releaseYear));

                if (match) {
                    steamId = match.id;
                    foundNewId = true;
                    console.log(`✅ MATCH: "${game.title}" -> Steam ID: ${steamId} (${match.name})`);
                } else {
                    // console.log(`❌ NO MATCH: "${game.title}"`);
                }
            } catch (e) {
                console.error(`Error searching steam for ${game.title}`, e);
            }
        }

        // 2. Fetch Review Stats if we have an ID
        if (steamId) {
            try {
                const stats = await getSteamReviewStats(steamId);
                if (stats) {
                    const updateData: any = {
                        steamUrl: `https://store.steampowered.com/app/${steamId}`,
                        steamReviewScore: stats.scoreDesc,
                        steamReviewCount: stats.totalReviews,
                        steamReviewPercent: stats.percentPositive,
                        dataFetched: true
                    };

                    if (foundNewId) {
                        updateData.steamAppId = String(steamId);
                    }

                    // Handle uniqueness collision for steamAppId just in case
                    try {
                        const existing = foundNewId ? await prisma.game.findUnique({ where: { steamAppId: String(steamId) } }) : null;

                        if (existing && existing.id !== game.id) {
                            console.warn(`⚠️ Steam ID Collision ${steamId} with game "${existing.title}". Skipping ID update.`);
                            delete updateData.steamAppId;
                        }

                        if (Object.keys(updateData).length > 0) {
                            await prisma.game.update({
                                where: { id: game.id },
                                data: updateData
                            });
                            console.log(`   📝 Updated Stats: ${stats.scoreDesc} (${stats.percentPositive}%)`);
                            updatedCount++;
                        }

                    } catch (e) {
                        console.error(`Error updating game ${game.title}`, e);
                    }
                }
            } catch (e) {
                console.error(`Error getting stats for ${game.title}`, e);
            }
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
    }

    console.log(`\n🏁 Terminé. ${updatedCount} jeux mis à jour.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
