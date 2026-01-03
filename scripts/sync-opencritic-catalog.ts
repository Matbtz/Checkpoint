import './env-loader';
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames } from '../lib/igdb';
import { searchRawgGames, getRawgGameDetails } from '../lib/rawg';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// --- CONFIGURATION ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const DELAY_MS = 2000;
const MAX_PAGES = 50;


// --- UTILS ---
function normalize(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isMatch(localGame: { title: string, releaseDate: Date | null }, apiTitle: string, apiDateStr: string | null): boolean {
  const nDb = normalize(localGame.title);
  const nApi = normalize(apiTitle);

  if (nDb !== nApi) return false;

  // If both have dates, check year match to avoid remakes/sequels with same name
  // OpenCritic date is ISO string (e.g. "2023-10-20T...")
  if (localGame.releaseDate && apiDateStr) {
    const localYear = localGame.releaseDate.getFullYear();
    const apiYear = new Date(apiDateStr).getFullYear();
    // Allow 1 year difference (e.g. late Dec vs early Jan, or regional release)
    return Math.abs(localYear - apiYear) <= 1;
  }

  return true;
}

// Fonction pour récupérer les métadonnées manquantes (Desc, Genres) via IGDB/RAWG
async function fetchAdditionalMetadata(title: string) {
  try {
    // 1. Essai IGDB (Meilleure source pour genres/desc structurés)
    const igdbResults = await searchIgdbGames(title, 1);
    if (igdbResults.length > 0) {
      const g = igdbResults[0];
      return {
        description: g.summary || null,
        genres: g.genres ? JSON.stringify(g.genres.map(x => x.name)) : null,
        platforms: g.platforms ? g.platforms.map(x => ({ name: x.name })) : [], // Return Object for Prisma Json
        igdbId: String(g.id)
      };
    }

    // 2. Fallback RAWG
    const rawgResults = await searchRawgGames(title, 1);
    if (rawgResults.length > 0) {
      const listGame = rawgResults[0];
      // Fetch details for description because list view usually lacks it
      const details = await getRawgGameDetails(listGame.id);
      const g = details || listGame;

      return {
        description: g.description_raw || null,
        genres: g.genres ? JSON.stringify(g.genres.map(x => x.name)) : null,
        platforms: [],
        igdbId: null
      };
    }
  } catch (e) {
    console.error(`Error fetching metadata for ${title}`, e);
  }
  return { description: null, genres: null, platforms: [], igdbId: null };
}

// --- SCRIPT PRINCIPAL ---
async function main() {
  if (!RAPIDAPI_KEY) {
    console.error("❌ RAPIDAPI_KEY is missing in environment variables.");
    return;
  }

  // Handle Modes
  const args = process.argv.slice(2);
  const isContinue = args.includes('--continue') || args.includes('continue');
  const isCsv = args.includes('--csv');

  // Parse Sort Mode
  let sortMode = 'newest';
  const sortArg = args.find(a => a.startsWith('--sort='));
  if (sortArg) {
    const val = sortArg.split('=')[1];
    if (val === 'popular') sortMode = 'popularity';
    else sortMode = val;
  } else if (args.includes('score') || args.includes('--score')) {
    sortMode = 'score';
  } else if (args.includes('popular') || args.includes('--popular')) {
    sortMode = 'popularity';
  }

  // Parse Platform
  let platformMode: string | null = null;
  let platformId: string | null = null;

  const platArg = args.find(a => a.startsWith('--platform='));
  if (platArg) {
    platformMode = platArg.split('=')[1].toLowerCase();
  }

  // Platform Mapping (OpenCritic IDs)
  // PC=27, PS5=39, Switch=26, XBXS=40, PS4=6, XB1=7
  if (platformMode) {
    switch (platformMode) {
      case 'pc': platformId = '27'; break;
      case 'ps5': platformId = '39'; break;
      case 'ps4': platformId = '6'; break;
      case 'switch': platformId = '26'; break;
      // "switch 2" is speculative, mapping to Switch (26) or unknown. ignoring for now or mapping specific if verified.
      case 'xbox': platformId = '7,40'; break; // Xbox One + Series
      case 'series': platformId = '40'; break;
      default:
        console.warn(`⚠️ Unknown platform "${platformMode}". Ignoring filter.`);
        platformMode = null;
    }
  }

  const stateSuffix = platformMode ? `-${sortMode}-${platformMode}` : `-${sortMode}`;
  const STATE_FILE = path.resolve(process.cwd(), `scripts/sync-state${stateSuffix}.json`);

  // --- CSV SETUP ---
  let csvStream: fs.WriteStream | null = null;
  if (isCsv) {
    const csvPath = path.join(process.cwd(), 'scripts', 'csv', `opencritic_sync${stateSuffix}.csv`);
    if (!fs.existsSync(path.dirname(csvPath))) fs.mkdirSync(path.dirname(csvPath), { recursive: true });

    const fileExists = fs.existsSync(csvPath);
    // Append mode ('a') if exists, otherwise write ('w')
    csvStream = fs.createWriteStream(csvPath, { flags: fileExists ? 'a' : 'w' });

    const headers = [
      "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
      "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
      "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
      "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
      "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
      "storyline", "status", "gameType", "parentId", "relatedGames"
    ];

    const escapeCsv = (field: any): string => {
      if (field === null || field === undefined) return '';
      let str = String(field);
      if (typeof field === 'object') str = JSON.stringify(field);
      str = str.replace(/[\r\n]+/g, ' ');
      str = str.replace(/"/g, '""');
      if (str.includes('|') || str.includes('"')) return `"${str}"`;
      return str;
    };

    if (!fileExists) {
      csvStream.write(headers.map(h => escapeCsv(h)).join('|') + '\n');
    }
    console.log(`📝 CSV Export enabled: ${csvPath} (Append: ${fileExists})`);
  }


  let startSkip = 0;
  if (!isCsv && isContinue) {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        startSkip = state.nextSkip || 0;
        console.log(`🔄 CONTINUE MODE (${sortMode}${platformMode ? '/' + platformMode : ''}): Resuming from skip ${startSkip}`);
      } else {
        console.log(`⚠️ CONTINUE MODE (${sortMode}${platformMode ? '/' + platformMode : ''}): No state file found. Starting from 0.`);
      }
    } catch (e) {
      console.error("⚠️ Failed to read state file. Starting from 0.", e);
    }
  } else {
    // For CSV mode, we normally assume fetching new data or from 0, unless user wants to control skip manually via code.
    // Assuming fresh/append means we might fetch duplicates if we don't track state. 
    // User requested "always the same CSV by appending new lines".
    console.log(`🆕 NEW MODE (${sortMode}${platformMode ? '/' + platformMode : ''}): Starting from 0.`);
  }

  console.log(`🚀 Starting OpenCritic Discovery & Sync (Sort: ${sortMode}${platformMode ? ', Platform: ' + platformMode : ''})...`);

  // 1. Pré-chargement des jeux locaux pour éviter des milliers de requêtes DB - ONLY IF NOT CSV
  let knownGames: any[] = [];
  if (!isCsv) {
    const localGames = await prisma.game.findMany({
      select: { id: true, title: true, opencriticScore: true, releaseDate: true }
    });
    knownGames = [...localGames];
    console.log(`📋 Loaded ${localGames.length} local games.`);
  } else {
    console.log(`📋 CSV Mode: Skipping DB load.`);
  }

  let pagesProcessed = 0;
  let gamesCreated = 0;
  let gamesUpdated = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    const currentSkip = startSkip + (i * 20);

    // URL construction with sort mode and platform
    let url = `https://opencritic-api.p.rapidapi.com/game?skip=${currentSkip}&sort=${sortMode}`;
    if (platformId) {
      url += `&platforms=${platformId}`;
    }

    console.log(`\n📄 Fetching page ${i + 1} (skip: ${currentSkip})...`);

    try {
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (res.status === 429) { console.error("🛑 API Rate limit."); break; }
      if (!res.ok) { console.error(`❌ API Error: ${res.status}`); break; }

      const apiGames = await res.json();
      if (!Array.isArray(apiGames) || apiGames.length === 0) break;

      for (const apiGame of apiGames) {
        if (!apiGame.name) continue;
        // DLC / Expansion Handling
        const lowerTitle = apiGame.name.toLowerCase();

        // 1. HARD SKIP: Junk we never want (Soundtracks, Season Passes, Skin Packs, etc)
        if (lowerTitle.match(/(soundtrack|season pass|costume|skin|currency|virtual currency|points block|credits)/i)) {
          continue; // Skip junk
        }
        // Skip "Pack" unless it's an "Expansion Pack"
        if (lowerTitle.includes("pack") && !lowerTitle.includes("expansion pack")) {
          continue; // Skip generic packs (weapons, costumes)
        }

        // 2. IDENTIFY DLC: Mark as DLC if "DLC" or "Expansion" is in title
        let isDlc = false;
        let parentId: string | null = null;

        if (lowerTitle.match(/\b(dlc|expansion)\b/i) || lowerTitle.includes(" - ") || lowerTitle.includes(": ")) {
          // Note: ":" or " - " often implies DLC (e.g. "Game: Episode 1").
          // We check against known expansion terms or just structural indicators if we want to be aggressive.
          // For now, let's trust the "Expansion" keyword OR generic subtitle structure if it looks like an episode.
          if (lowerTitle.match(/\b(dlc|expansion|episode|content)\b/i) || lowerTitle.includes(":")) {
            isDlc = true;

            // 3. TRY TO FIND PARENT
            // Pattern: "Base Game: DLC Name" or "Base Game - DLC Name"
            const separatorRegex = /(:| - )/g;
            if (apiGame.name.match(separatorRegex)) {
              // Try to extract base title
              const parts = apiGame.name.split(separatorRegex);
              if (parts.length > 0) {
                const baseTitleCandidate = parts[0].trim();
                // Look up base game in DB
                const parent = knownGames.find(g => g.title === baseTitleCandidate); // Use in-memory check first
                if (parent) {
                  parentId = parent.id;
                  // console.log(`   🔗 Linked DLC "${apiGame.name}" to Parent "${baseTitleCandidate}"`);
                }
              }
            }
          }
        }

        // On nettoie le titre OpenCritic
        const cleanTitle = apiGame.name.trim();
        const apiReleaseDateStr = apiGame.firstReleaseDate || null;

        // A. EXISTE DÉJÀ ? (Titre + Année)
        const match = knownGames.find(local => isMatch(local, cleanTitle, apiReleaseDateStr));

        if (match) {
          // UPDATE (Maintenance)
          const newScore = (apiGame.topCriticScore && apiGame.topCriticScore !== -1) ? Math.round(apiGame.topCriticScore) : null;

          // Update if score differs (but protect existing valid scores from being nulled unless they are -1)
          const shouldUpdate =
            (newScore !== null && match.opencriticScore !== newScore) ||
            (newScore === null && match.opencriticScore === -1);

          if (shouldUpdate) {
            console.log(`   🔄 UPDATING: "${match.title}" (Score: ${newScore ?? 'null'})`);

            if (csvStream) {
              // For CSV update, we want to write the FULL record with updated score. 
              // But we don't have full record in 'knownGames'. Accessing DB for full record is expensive.
              // Compromise: Write a record with just ID and updated fields? import script assumes full replace or merge.
              // Import script: "Update ONLY empty fields...". Wait, import script logic is "if exists, update only if existing is empty".
              // This means CSV import WON'T override existing score if DB has one.
              // So CSV export for UPDATE is tricky if import script doesn't force update.
              // User asked for "merge the CSV make checks and when verified import all".
              // So likely they want the CSV to represent the *desired state*.
              // Ideally we strictly export NEW games to CSV, and let direct update handle existing?
              // OR we fetch full game to export.

              // Let's just SKIP updates in CSV mode to keep it simple and focused on "New Game Discovery".
              // Or log it.
              // console.log("   (Skipping CSV write for update - existing game)");
            } else {
              await prisma.game.update({
                where: { id: match.id },
                data: {
                  opencriticScore: newScore,
                  // Also update URL if available, as user script missed it
                  ...(apiGame.url ? { opencriticUrl: apiGame.url } : {})
                }
              });
            }
            gamesUpdated++;
            match.opencriticScore = newScore;
          } else {
            // Debug log for popular sort transparency
            // console.log(`   . Skipped: "${match.title}" (Up to date)`);
          }
        }
        else {
          // B. NOUVEAU JEU (Création + Enrichment)
          console.log(`   ✨ CREATING: "${cleanTitle}"...`);

          const releaseYear = apiReleaseDateStr ? new Date(apiReleaseDateStr).getFullYear() : null;

          // ... (rest of creation logic)


          // 1. Récupération des images (Steam > IGDB > RAWG)
          const art = await findBestGameArt(cleanTitle, releaseYear);

          // 2. Récupération métadonnées textuelles (Desc, Genres)
          const meta = await fetchAdditionalMetadata(cleanTitle);

          // Resolve ID: Prefer IGDB ID > Fallback OpenCritic ID
          let newGameId = meta.igdbId;

          if (!newGameId && art?.source === 'igdb' && art.originalData) {
            // Cast to any because originalData is a union but all members have 'id' (number)
            newGameId = String((art.originalData as any).id);
          }



          // Optimization: check knownGames first? No, knownGames has internal ID, not IGDB ID (unless we fetched it).
          // We only fetched id/title/score.
          // So we must DB check or risk P2002.

          // --- DB CHECKS (Skip if CSV) ---
          let existingByIgdb = null;
          let existingById = null;

          if (!isCsv) {
            if (meta.igdbId) {
              existingByIgdb = await prisma.game.findUnique({
                where: { igdbId: String(meta.igdbId) },
                select: { id: true, title: true, opencriticScore: true }
              });
            } else if (art?.source === 'igdb' && art.originalData) {
              const aid = String((art.originalData as any).id);
              existingByIgdb = await prisma.game.findUnique({
                where: { igdbId: aid },
                select: { id: true, title: true, opencriticScore: true }
              });
            }

            if (existingByIgdb) {
              console.log(`      ⚠️ Game exists by IGDB ID (${existingByIgdb.title}). Merging/Skipping.`);
              // We might want to update score? But for simplicity, existing logic continues.
              // Re-implement minimal score update if needed, but usually we just skip in this simplified view.

              // Update Score Logic from original...
              if (apiGame.topCriticScore && apiGame.topCriticScore !== -1) {
                const newScore = Math.round(apiGame.topCriticScore);
                if (existingByIgdb.opencriticScore !== newScore) {
                  await prisma.game.update({
                    where: { id: existingByIgdb.id },
                    data: { opencriticScore: newScore }
                  });
                  console.log(`      ⭐ Updated Score: ${newScore}`);
                }
              }
              continue;
            }

            if (!newGameId) {
              newGameId = `opencritic-${apiGame.id}`;
            }

            const existingById = await prisma.game.findUnique({ where: { id: newGameId } });
            if (existingById) {
              console.log(`      ⚠️ Game exists by ID (${newGameId}) but title mismatch. Skipping creation.`);
              continue;
            }
          } else {
            // CSV Mode: Just generate ID
            if (!newGameId) newGameId = `opencritic-${apiGame.id}`;
          }

          // Prefer Enriched Release Date (IGDB/RAWG/Steam) over OpenCritic's date
          let releaseDate = apiReleaseDateStr ? new Date(apiReleaseDateStr) : null;

          if (art?.originalData) {
            if (art.source === 'igdb') {
              const d = (art.originalData as any).first_release_date;
              if (d) releaseDate = new Date(d * 1000);
            } else if (art.source === 'rawg') {
              const d = (art.originalData as any).released;
              if (d) releaseDate = new Date(d);
            }
          }

          const opencriticScore = (apiGame.topCriticScore && apiGame.topCriticScore !== -1) ? Math.round(apiGame.topCriticScore) : null;
          const opencriticUrl = apiGame.url || `https://opencritic.com/game/${apiGame.id}/${normalize(cleanTitle)}`;

          // Prepare Data Object
          const platforms = meta.platforms && meta.platforms.length > 0
            ? meta.platforms // Already objects {name}
            : []; // We could refine this from IGDB enrichment if needed

          const gameData = {
            id: newGameId,
            title: cleanTitle,
            releaseDate: releaseDate,
            opencriticScore: opencriticScore,
            opencriticUrl: opencriticUrl,
            coverImage: art?.cover || null,
            backgroundImage: art?.background || null,
            description: meta.description,
            genres: meta.genres,
            platforms: platforms,
            isDlc: isDlc,
            parentId: parentId,
            dataFetched: true,
            igdbId: (meta.igdbId || (art?.source === 'igdb' ? String((art.originalData as any).id) : null)),

            // Defaults/Empty for CSV
            screenshots: '[]', videos: '[]', steamUrl: null, steamAppId: null,
            steamReviewScore: null, steamReviewCount: null, steamReviewPercent: null,
            studio: null, igdbTime: null, dataMissing: false,
            hltbMain: null, hltbExtra: null, hltbCompletionist: null,
            storyline: null, status: null, gameType: null, relatedGames: null, igdbScore: null,
            igdbUrl: null, hltbUrl: null
          };

          if (csvStream) {
            const escapeCsv = (field: any): string => {
              if (field === null || field === undefined) return '';
              let str = String(field);
              if (typeof field === 'object') str = JSON.stringify(field);
              str = str.replace(/[\r\n]+/g, ' ');
              str = str.replace(/"/g, '""');
              if (str.includes('|') || str.includes('"')) return `"${str}"`;
              return str;
            };

            const row = [
              gameData.id, gameData.title, gameData.coverImage, gameData.backgroundImage,
              gameData.releaseDate ? gameData.releaseDate.toISOString() : '',
              gameData.description,
              gameData.screenshots, gameData.videos, gameData.steamUrl, gameData.opencriticUrl, gameData.igdbUrl, gameData.hltbUrl,
              gameData.opencriticScore, gameData.igdbScore, gameData.steamAppId,
              gameData.steamReviewScore, gameData.steamReviewCount, gameData.steamReviewPercent,
              gameData.isDlc, gameData.igdbId, gameData.studio, gameData.genres,
              JSON.stringify(gameData.platforms),
              gameData.igdbTime, gameData.dataMissing, gameData.dataFetched,
              gameData.hltbMain, gameData.hltbExtra, gameData.hltbCompletionist,
              gameData.storyline, gameData.status, gameData.gameType, gameData.parentId,
              gameData.relatedGames
            ];

            csvStream.write(row.map(r => escapeCsv(r)).join('|') + '\n');
            // console.log(`      📝 Added to CSV`);
          } else {
            // 3. Insertion en base
            await prisma.game.create({
              data: {
                id: gameData.id,
                title: gameData.title,
                releaseDate: gameData.releaseDate,
                opencriticScore: gameData.opencriticScore,
                opencriticUrl: gameData.opencriticUrl,
                coverImage: gameData.coverImage,
                backgroundImage: gameData.backgroundImage,
                description: gameData.description,
                genres: gameData.genres,
                platforms: gameData.platforms,
                isDlc: gameData.isDlc,
                parentId: gameData.parentId,
                dataFetched: true,
                updatedAt: new Date(),
                igdbId: gameData.igdbId
              }
            });
          }

          gamesCreated++;
          knownGames.push({
            id: newGameId,
            title: cleanTitle,
            opencriticScore: opencriticScore,
            releaseDate: releaseDate
          });

          // Rate Limit Protection for dependent APIs (RAWG/IGDB called in findBestGameArt)
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      pagesProcessed++;

      // Save State after each page (Only in DB mode for now)
      if (!isCsv) {
        const nextSkip = currentSkip + 20;
        try {
          fs.writeFileSync(STATE_FILE, JSON.stringify({ nextSkip, lastRun: new Date().toISOString() }, null, 2));
        } catch (e) {
          console.error("⚠️ Failed to save sync state", e);
        }
      }

      if (i < MAX_PAGES - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS)); // Respect rate limit
      }

    } catch (e) {
      console.error("Critical Error:", e);
      break;
    }
  }

  if (csvStream) csvStream.end();

  console.log("\n--- SUMMARY ---");
  console.log(`Pages scanned: ${pagesProcessed}`);
  console.log(`${isCsv ? 'Games Written to CSV' : 'Games Created'}: ${gamesCreated}`);
  console.log(`Games Updated: ${gamesUpdated}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

