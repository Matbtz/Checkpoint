
import './env-loader';
import { PrismaClient } from '@prisma/client';
import { getHypedGames } from '../lib/igdb';
import { getDiscoveryGamesIgdb, fetchIgdb, IgdbGame } from '../lib/igdb';

const prisma = new PrismaClient();

function normalize(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
    console.log("🔮 Syncing Upcoming & Hyped Games (IGDB)...");

    // We can use getDiscoveryGamesIgdb with 'ANTICIPATED' and 'UPCOMING'
    // Let's fetch Top 20 Anticipated and Top 20 Upcoming

    // 1. Anticipated (Hype based)
    console.log("\n--- Fetching Most Anticipated ---");
    const anticipated = await getDiscoveryGamesIgdb('ANTICIPATED', 100);

    // 2. Upcoming (Date based)
    console.log("\n--- Fetching Next Releases (Future) ---");
    const upcoming = await getDiscoveryGamesIgdb('UPCOMING', 100);

    // 3. Recently Released (Catch "Just Released" hits like GTA VI if we are in 2026)
    console.log("\n--- Fetching Recently Released (Past 6 Months) ---");
    // We reuse getDiscoveryGamesIgdb but need to ensure it supports a custom 'RECENT_HYPE' mode or valid logic
    // Actually, 'RECENT' in lib/igdb.ts only looks back 1 month. Let's make a custom call here for robustness.
    const now = Math.floor(Date.now() / 1000);
    const sixMonthsAgo = now - (180 * 24 * 60 * 60);
    // Fetch high rated or hyped games from last 6 months
    const body = `
        fields name, slug, url, cover.image_id, first_release_date, summary, aggregated_rating, total_rating, hypes,
               involved_companies.company.name, genres.name, platforms.name, screenshots.image_id;
        where first_release_date < ${now} & first_release_date > ${sixMonthsAgo} & (hypes > 10 | total_rating_count > 10);
        sort first_release_date desc;
        limit 50;
    `;
    const pendingRecent = await fetchIgdb<IgdbGame>('games', body); // This returns raw IgdbGame
    // We need to map it. Since we can't import mapRawToEnriched (not100 exported?), we might need to rely on getDiscoveryGamesIgdb if we tweak it,
    // OR just manually use the raw data since our create logic handles it. 
    // Wait, create logic uses 'g.cover' which is enriched object in my code? 
    // Ah, 'fetchIgdb' returns raw. My 'upcoming' array is Enriched.
    // I need to map "pendingRecent" to "Enriched".
    // Better strategy: Add 'RECENT_HYPE' to discovery type in lib/igdb.ts? 
    // Or just manually map here.
    const recent = pendingRecent.map((g: IgdbGame) => ({
        ...g,
        possibleCovers: g.cover ? [`https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`] : [],
        possibleBackgrounds: []
    }));

    const allGames = [...anticipated, ...upcoming, ...recent];
    // De-duplicate by ID
    const uniqueGames = Array.from(new Map(allGames.map(item => [item.id, item])).values());

    console.log(`\nFound ${uniqueGames.length} unique future games.`);

    let created = 0;
    let updated = 0;

    for (const g of uniqueGames) {
        const title = g.name.trim();
        const igdbId = String(g.id);
        const releaseDate = g.first_release_date ? new Date(g.first_release_date * 1000) : null;

        console.log(`\n🔍 Checking "${title}" (IGDB: ${igdbId}, Date: ${releaseDate?.toISOString().split('T')[0] || 'TBD'})`);

        // Check Match (Prefer IGDB ID)
        let match = await prisma.game.findUnique({
            where: { igdbId: igdbId }
        });

        if (!match) {
            // Fallback: Title + Year match for robust checking
            // But since these are future games, local DB might not have them.
            // Still worth a quick check to avoid duplication if manually added without IGDB ID.
            const nTitle = normalize(title);
            const candidates = await prisma.game.findMany({
                where: { title: { contains: title.substring(0, 10) } } // Optimization
            });
            match = candidates.find(c => normalize(c.title) === nTitle) || null;
        }

        if (match) {
            // Update mode: Ensure Release Date is fresh OR we are missing enriched data
            const isMissingData = !match.storyline || (match.videos && match.videos.length === 0);
            const dateChanged = releaseDate && match.releaseDate && releaseDate.getTime() !== match.releaseDate.getTime();

            if (dateChanged || isMissingData) {
                console.log(`   🔄 Updating Game: ${match.title} (Date Changed: ${dateChanged}, Missing Data: ${isMissingData})`);
                await prisma.game.update({
                    where: { id: match.id },
                    data: {
                        releaseDate: releaseDate,
                        igdbId: igdbId, // Ensure link
                        // Update extended fields if available
                        storyline: g.storyline,
                        videos: g.videos ? g.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`) : undefined,
                        keywords: g.keywords ? g.keywords.map(k => k.name) : undefined,
                        relatedGames: {
                            dlcs: g.dlcs?.map(d => ({ id: d.id, name: d.name })) || [],
                            expansions: g.expansions?.map(e => ({ id: e.id, name: e.name })) || [],
                            remakes: g.remakes?.map(r => ({ id: r.id, name: r.name })) || [],
                            remasters: g.remasters?.map(r => ({ id: r.id, name: r.name })) || [],
                            franchise_games: (g.franchises?.[0]?.games || g.collection?.games || []).map(fg => ({ id: fg.id, name: fg.name }))
                        }
                    }
                });
                updated++;
            } else {
                console.log(`   ✅ Up to date.`);
            }
        } else {
            // Create Mode
            console.log(`   ✨ Creating new upcoming game...`);

            // Prepare Data
            const cover = g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : null;
            const bg = g.screenshots && g.screenshots.length > 0
                ? `https://images.igdb.com/igdb/image/upload/t_1080p/${g.screenshots[0].image_id}.jpg`
                : null;

            // Generate Custom ID
            const newId = `igdb-${igdbId}`;

            await prisma.game.create({
                data: {
                    id: newId,
                    title: title,
                    releaseDate: releaseDate,
                    coverImage: cover,
                    backgroundImage: bg,
                    description: g.summary,
                    genres: g.genres ? JSON.stringify(g.genres.map(x => x.name)) : null,
                    platforms: g.platforms ? g.platforms.map(x => ({ name: x.name })) : [],
                    igdbId: igdbId,
                    igdbScore: g.total_rating ? Math.round(g.total_rating) : null,
                    igdbUrl: g.url,
                    dataFetched: true,
                    updatedAt: new Date(),
                    // Extended Metadata
                    storyline: g.storyline,
                    videos: g.videos ? g.videos.map(v => `https://www.youtube.com/watch?v=${v.video_id}`) : [],
                    keywords: g.keywords ? g.keywords.map(k => k.name) : [],
                    themes: g.themes ? g.themes.map(t => t.name) : [],
                    gameType: g.game_type,
                    status: g.status,
                    relatedGames: {
                        dlcs: g.dlcs?.map(d => ({ id: d.id, name: d.name })) || [],
                        expansions: g.expansions?.map(e => ({ id: e.id, name: e.name })) || [],
                        remakes: g.remakes?.map(r => ({ id: r.id, name: r.name })) || [],
                        remasters: g.remasters?.map(r => ({ id: r.id, name: r.name })) || [],
                        franchise_games: (g.franchises?.[0]?.games || g.collection?.games || []).map(fg => ({ id: fg.id, name: fg.name }))
                    }
                }
            });
            created++;
        }
    }

    console.log(`\n🏁 Sync Complete. Created: ${created}, Updated: ${updated}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
