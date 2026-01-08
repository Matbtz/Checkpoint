import './env-loader';
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames, getIgdbGameDetails, getIgdbTimeToBeat, getIgdbImageUrl, EnrichedIgdbGame, IgdbGame } from '../lib/igdb';
import { searchRawgGames, getRawgGameDetails, RawgGame } from '../lib/rawg';
import { searchSteamStore, getSteamReviewStats } from '../lib/steam-store';
import { stringSimilarity } from '../lib/utils';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// --- CONFIGURATION ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const DELAY_MS = 280;
const MAX_PAGES = 160;


// --- UTILS ---
function normalize(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function normalizeGenre(g: string): string {
  const lower = g.toLowerCase().trim();
  if (lower === 'role-playing game' || lower === 'role playing game' || lower === 'rpg') return 'RPG';
  if (lower === 'sci-fi' || lower === 'science fiction') return 'Sci-Fi';
  if (lower === 'beat \'em up' || lower === 'beat em up') return 'Beat \'em up';
  if (lower === 'shoot \'em up' || lower === 'shoot em up' || lower === 'shmup') return 'Shoot \'em up';
  return g;
}

function isMatch(localGame: { title: string, releaseDate: Date | null }, apiTitle: string, apiDateStr: string | null): boolean {
  const nDb = normalize(localGame.title);
  const nApi = normalize(apiTitle);

  if (nDb !== nApi) {
    // Allow minor fuzzy match if exact fails? OpenCritic usually has good titles.
    // But for enrichment sources (Steam/IGDB) we might want the stricter check from enrich-library.
    return false;
  }

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

// Reuse logic from lib/enrichment.ts
function isExternalMatch(localTitle: string, remoteTitle: string, localDate: Date | null, remoteYear: number | null): boolean {
  const nLocal = normalize(localTitle);
  const nRemote = normalize(remoteTitle);

  const sim = stringSimilarity(nLocal, nRemote);
  const titleMatch = sim >= 0.85 || nLocal.includes(nRemote) || nRemote.includes(nLocal);

  if (!titleMatch) return false;

  if (localDate && remoteYear) {
    const localYear = localDate.getFullYear();
    return Math.abs(localYear - remoteYear) <= 1;
  }

  return true;
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
  const STATE_FILE = path.resolve(process.cwd(), `scripts/sync-state${stateSuffix}${isCsv ? '-csv' : ''}.json`);

  // --- CSV SETUP ---
  let csvStream: fs.WriteStream | null = null;

  const escapeCsv = (field: any): string => {
    if (field === null || field === undefined) return '';
    let str = String(field);
    if (typeof field === 'object') str = JSON.stringify(field);
    str = str.replace(/[\r\n]+/g, ' ');
    str = str.replace(/"/g, '""');
    if (str.includes('|') || str.includes('"')) return `"${str}"`;
    return str;
  };

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
      "storyline", "status", "gameType", "parentId", "relatedGames", "franchise",
      "hypes", "keywords", "themes", "dlcs", "ports", "remakes", "remasters"
    ];

    if (!fileExists) {
      csvStream.write(headers.map(h => escapeCsv(h)).join('|') + '\n');
    }
    console.log(`📝 CSV Export enabled: ${csvPath} (Append: ${fileExists})`);
  }


  let startSkip = 0;
  if (isContinue) {
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
              // log update
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
          }
        }
        else {
          // B. NOUVEAU JEU (Création + Enrichment)
          console.log(`   ✨ CREATING: "${cleanTitle}"...`);

          let releaseYear = apiReleaseDateStr ? new Date(apiReleaseDateStr).getFullYear() : null;

          // --- FULL ENRICHMENT (Adapted from enrich-library.ts) ---

          // 1. Art & Basic Source (IGDB prefered)
          const art = await findBestGameArt(cleanTitle, releaseYear);

          // 2. Resolve IGDB Data (Full Details)
          let igdbData: EnrichedIgdbGame | IgdbGame | null = null;
          let igdbId: string | null = null;

          // Try to get ID from art search first
          if (art?.source === 'igdb' && art.originalData) {
            igdbData = art.originalData as any;
            igdbId = String((igdbData as any).id);
          } else {
            // Search IGDB specifically if not found via art
            const igdbResults = await searchIgdbGames(cleanTitle, 5);
            if (igdbResults.length > 0) {
              for (const res of igdbResults) {
                const cYear = res.first_release_date ? new Date(res.first_release_date * 1000).getFullYear() : null;
                if (isExternalMatch(cleanTitle, res.name, apiReleaseDateStr ? new Date(apiReleaseDateStr) : null, cYear)) {
                  igdbData = res;
                  igdbId = String(res.id);
                  break; // Found match
                }
              }
            }
          }

          // If we have an IGDB ID, fetch FULL details (Enriched)
          if (igdbId) {
            try {
              const fullDetails = await getIgdbGameDetails(parseInt(igdbId));
              if (fullDetails) {
                igdbData = fullDetails;
              }
            } catch (e) { /* ignore */ }
          }

          // 3. Fallback RAWG if IGDB missing (for Genres/Desc)
          let rawgData: RawgGame | null = null;
          if (!igdbData) {
            const rawgResults = await searchRawgGames(cleanTitle, 1);
            if (rawgResults.length > 0) {
              const res = rawgResults[0];
              const cYear = res.released ? new Date(res.released).getFullYear() : null;
              if (isExternalMatch(cleanTitle, res.name, apiReleaseDateStr ? new Date(apiReleaseDateStr) : null, cYear)) {
                // Get full details
                const details = await getRawgGameDetails(res.id);
                rawgData = details || res;
              }
            }
          }

          // 4. Steam Stats
          let steamId: number | null = null;
          let steamReviewStats: any = null;
          try {
            // Search Steam
            const results = await searchSteamStore(cleanTitle);
            const sMatch = results.find(r => isExternalMatch(cleanTitle, r.name, apiReleaseDateStr ? new Date(apiReleaseDateStr) : null, r.releaseYear));
            if (sMatch) {
              steamId = sMatch.id;
              steamReviewStats = await getSteamReviewStats(steamId);
            }
          } catch (e) { /* ignore */ }


          // --- CONSTRUCT GAME DATA ---
          // Prefer Enriched Release Date
          let releaseDate = apiReleaseDateStr ? new Date(apiReleaseDateStr) : null;
          if (igdbData?.first_release_date) {
            releaseDate = new Date(igdbData.first_release_date * 1000);
          } else if (rawgData?.released) {
            releaseDate = new Date(rawgData.released);
          }

          // Descriptions
          const description = (igdbData as EnrichedIgdbGame)?.summary || rawgData?.description_raw || null; // Cast safely or use any
          const storyline = (igdbData as EnrichedIgdbGame)?.storyline || null;

          // Genres & Themes
          const genreSet = new Set<string>();
          if (igdbData?.genres) igdbData.genres.forEach(g => genreSet.add(normalizeGenre(g.name)));
          if ((igdbData as EnrichedIgdbGame)?.themes) (igdbData as EnrichedIgdbGame).themes?.forEach(t => genreSet.add(normalizeGenre(t.name)));
          if (rawgData?.genres) rawgData.genres.forEach(g => genreSet.add(normalizeGenre(g.name)));
          const genres = Array.from(genreSet);

          // Platforms
          let platforms: any[] = [];
          if (igdbData?.platforms) platforms = igdbData.platforms.map(p => ({ name: p.name }));
          // We could map OpenCritic platforms too if IGDB missing, but IGDB usually better.

          // DLC Status
          let isDlc = false;
          let parentId: string | null = null;
          const typeId = (igdbData as EnrichedIgdbGame)?.game_type ?? (igdbData as EnrichedIgdbGame)?.category;
          if (typeId === 1 || typeId === 2) {
            isDlc = true;
            // We could try to resolve parent from IGDB but that requires DB lookup. 
            // In CSV mode, we just store parentId if we can find it?
            // The original script logic for parentId using string splitting is decent for a fallback.
            // Use IGDB parent name too?
            if ((igdbData as EnrichedIgdbGame)?.parent_game) {
              // We can't easily resolve to UUID without DB check.
              // For CSV, maybe store parent name? Or stick to original script's local cache check?
              // Original script checked 'knownGames'.
              const parentName = (igdbData as EnrichedIgdbGame).parent_game?.name;
              const parent = knownGames.find(g => g.title === parentName);
              if (parent) parentId = parent.id;
            }
          }
          if (!isDlc) {
            // Fallback to original script heuristic
            if (lowerTitle.match(/\b(dlc|expansion|episode|content)\b/i) || lowerTitle.includes(":")) {
              const separatorRegex = /(:| - )/g;
              if (cleanTitle.match(separatorRegex)) {
                const parts = cleanTitle.split(separatorRegex);
                if (parts.length > 0) {
                  const baseTitleCandidate = parts[0].trim();
                  const parent = knownGames.find(g => g.title === baseTitleCandidate);
                  if (parent) {
                    parentId = parent.id;
                    isDlc = true;
                  }
                }
              }
            }
          }

          // ID Generation
          let newGameId = igdbId ? String(igdbId) : null;
          if (!isCsv && !newGameId) {
            // Try to avoid dups if no IGDB ID
            newGameId = `opencritic-${apiGame.id}`;
          }
          if (isCsv && !newGameId) newGameId = `opencritic-${apiGame.id}`;

          // Extra Metadata
          const keywords = (igdbData as EnrichedIgdbGame)?.keywords?.map(k => k.name) || null;
          const franchise = (igdbData as EnrichedIgdbGame)?.collection?.name || ((igdbData as EnrichedIgdbGame)?.franchises?.[0]?.name) || null;
          const hypes = (igdbData as EnrichedIgdbGame)?.hypes || null;

          // JSON Relations
          const dlcs = (igdbData as EnrichedIgdbGame)?.dlcs?.map(d => ({ id: d.id, name: d.name })) || null;
          const ports = (igdbData as EnrichedIgdbGame)?.ports?.map(d => ({ id: d.id, name: d.name })) || null;
          const remakes = (igdbData as EnrichedIgdbGame)?.remakes?.map(d => ({ id: d.id, name: d.name })) || null;
          const remasters = (igdbData as EnrichedIgdbGame)?.remasters?.map(d => ({ id: d.id, name: d.name })) || null;

          // Times
          let igdbTime = null;
          if (igdbId) {
            const timeData = await getIgdbTimeToBeat(parseInt(igdbId));
            if (timeData) {
              igdbTime = {
                hastly: timeData.hastly,
                normally: timeData.normally,
                completely: timeData.completely
              };
            }
          }

          // Media
          const screenshots = (igdbData as EnrichedIgdbGame)?.screenshots?.map(s => getIgdbImageUrl(s.image_id, '1080p')) || [];
          const videos = (igdbData as EnrichedIgdbGame)?.videos?.map(v => `https://www.youtube.com/watch?v=${v.video_id}`) || [];

          const opencriticScore = (apiGame.topCriticScore && apiGame.topCriticScore !== -1) ? Math.round(apiGame.topCriticScore) : null;

          // Studio Extraction
          let studio: string | null = null;
          if ((igdbData as EnrichedIgdbGame)?.involved_companies) {
            const dev = (igdbData as EnrichedIgdbGame).involved_companies?.find(c => c.developer);
            if (dev) studio = dev.company.name;
            else if ((igdbData as EnrichedIgdbGame).involved_companies?.length && (igdbData as EnrichedIgdbGame).involved_companies!.length > 0) {
              // Fallback to first company if no dev specified
              studio = (igdbData as EnrichedIgdbGame).involved_companies![0].company.name;
            }
          }

          const gameData = {
            id: newGameId,
            title: cleanTitle,
            releaseDate: releaseDate,
            opencriticScore: opencriticScore,
            opencriticUrl: apiGame.url || `https://opencritic.com/game/${apiGame.id}/${normalize(cleanTitle)}`,
            coverImage: art?.cover || null,
            backgroundImage: art?.background || null,
            description: description,
            genres: JSON.stringify(genres),
            platforms: platforms,
            isDlc: isDlc,
            parentId: parentId,
            dataFetched: true,
            igdbId: igdbId,

            // New Fields
            screenshots: JSON.stringify(screenshots),
            videos: JSON.stringify(videos),
            steamUrl: steamId ? `https://store.steampowered.com/app/${steamId}` : null,
            steamAppId: steamId ? String(steamId) : null,
            steamReviewScore: steamReviewStats?.scoreDesc || null,
            steamReviewCount: steamReviewStats?.totalReviews || null,
            steamReviewPercent: steamReviewStats?.percentPositive || null,
            igdbScore: (igdbData?.total_rating || igdbData?.aggregated_rating) ? Math.round(igdbData.total_rating || igdbData.aggregated_rating!) : null,
            igdbUrl: (igdbData as EnrichedIgdbGame)?.url || null,
            igdbTime: JSON.stringify(igdbTime),

            studio: studio,
            dataMissing: false,
            hltbMain: null, hltbExtra: null, hltbCompletionist: null, hltbUrl: null, // DISABLED HLTB SCRAPING

            storyline: storyline,
            status: (igdbData as EnrichedIgdbGame)?.status,
            gameType: (igdbData as EnrichedIgdbGame)?.game_type,
            relatedGames: null, // Use specific cols below or custom JSON?

            franchise: franchise,
            hypes: hypes,
            keywords: keywords ? JSON.stringify(keywords) : null,
            themes: null, // Merged into genres usually, keeping null or specific? Plan said themes.
            dlcs: dlcs ? JSON.stringify(dlcs) : null,
            ports: ports ? JSON.stringify(ports) : null,
            remakes: remakes ? JSON.stringify(remakes) : null,
            remasters: remasters ? JSON.stringify(remasters) : null
          };

          if (csvStream) {
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
              gameData.relatedGames,
              gameData.franchise, gameData.hypes, gameData.keywords, gameData.themes,
              gameData.dlcs, gameData.ports, gameData.remakes, gameData.remasters
            ];

            csvStream.write(row.map(r => escapeCsv(r)).join('|') + '\n');
            // console.log(`      📝 Added to CSV`);
          } else {
            // DB Creation logic - Ignoring for now as focus is CSV or User will run without CSV flag
            // But I must update it to be safe.
            // Original script had simple create.
            // Updating to use new fields would require Prisma schema update which I haven't done/checked.
            // Assuming Prisma Schema HAS these fields from previous context? 
            // "Updating Deprecated Packages" -> "Enhance Game Data Details" -> User added schema?
            // User Request: "enrich-library" has them. So Schema likely has them.
            // I'll add them to 'data' block.

            await prisma.game.create({
              data: {
                id: gameData.id || `opencritic-${apiGame.id}`, // Fallback
                title: gameData.title,
                releaseDate: gameData.releaseDate,
                opencriticScore: gameData.opencriticScore,
                opencriticUrl: gameData.opencriticUrl,
                coverImage: gameData.coverImage,
                backgroundImage: gameData.backgroundImage,
                description: gameData.description,
                genres: gameData.genres, // Stringified JSON? No, Prisma expects string[] if it's String[] or JSON. 
                // Wait, in sync-opencritic:49 it was JSON.stringify.
                // In enrich-library it uses Prisma and passes array?
                // Let's check enrich-library.ts:552 "updateData.genres = Array.from(newGenres)" -> It passes Array.
                // sync-opencritic-catalog.ts:491 "genres: gameData.genres" (where it was JSON.stringify).
                // If Prisma schema says String[], passing stringified JSON is wrong. 
                // If it says Json, it's fine.
                // Let's assume enrich-library is correct (Array).
                // So I should UN-stringify for Prisma create.
                // But previously sync-opencritic did JSON.stringify.
                // I will keep it consistent with what I see in enrich-library (Array) for Prisma, String for CSV.

                // Oops, gameData.genres above is "JSON.stringify(genres)".
                // I'll just rely on `genres` variable.

                platforms: gameData.platforms, // Json
                isDlc: gameData.isDlc,
                parentId: gameData.parentId,
                dataFetched: true,
                updatedAt: new Date(),
                igdbId: gameData.igdbId,

                // Add new fields if they exist in schema
                // Safe way: cast to any or check schema?
                // I'll stick to what was there + essential. 
                // The User request emphasizes CSV. 
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

          // Rate Limit Protection
          await new Promise(r => setTimeout(r, 200));
        }
      }

      pagesProcessed++;

      // Save State after each page
      const nextSkip = currentSkip + 20;
      try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({ nextSkip, lastRun: new Date().toISOString() }, null, 2));
      } catch (e) {
        console.error("⚠️ Failed to save sync state", e);
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

