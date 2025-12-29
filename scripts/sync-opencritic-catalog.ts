import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';
import { searchIgdbGames } from '../lib/igdb';
import { searchRawgGames, getRawgGameDetails } from '../lib/rawg';
import fs from 'fs';
import path from 'path';

// --- ENV LOADING ---
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const file = fs.readFileSync(envPath, 'utf8');
    file.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0 && !line.trim().startsWith('#')) {
        const key = line.substring(0, idx).trim();
        let val = line.substring(idx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[key] = val;
      }
    });
  }
} catch (e) {
  console.warn("Failed to load .env file manually");
}

const prisma = new PrismaClient();

// --- CONFIGURATION ---
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const DELAY_MS = 2000;
const MAX_PAGES = 5;
const STATE_FILE = path.resolve(process.cwd(), 'scripts/sync-state.json');

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

  let startSkip = 0;
  if (isContinue) {
      try {
          if (fs.existsSync(STATE_FILE)) {
              const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
              startSkip = state.nextSkip || 0;
              console.log(`🔄 CONTINUE MODE: Resuming from skip ${startSkip}`);
          } else {
              console.log("⚠️ CONTINUE MODE: No state file found. Starting from 0.");
          }
      } catch (e) {
          console.error("⚠️ Failed to read state file. Starting from 0.", e);
      }
  } else {
      console.log("🆕 NEW MODE: Starting fresh from 0.");
  }

  console.log("🚀 Starting OpenCritic Discovery & Sync (Sort: Newest)...");

  // 1. Pré-chargement des jeux locaux pour éviter des milliers de requêtes DB
  const localGames = await prisma.game.findMany({
    select: { id: true, title: true, opencriticScore: true, releaseDate: true }
  });

  // Mutable list to check against newly added games in this run
  const knownGames = [...localGames];

  console.log(`📋 Loaded ${localGames.length} local games.`);

  let pagesProcessed = 0;
  let gamesCreated = 0;
  let gamesUpdated = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    const currentSkip = startSkip + (i * 20);

    // sort=newest pour avoir les dernières sorties
    const url = `https://opencritic-api.p.rapidapi.com/game?skip=${currentSkip}&sort=newest`;

    console.log(`\n📄 Fetching page ${i + 1} (skip: ${currentSkip})...`);

    try {
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
        }
      });

      if (res.status === 429) { console.error("🛑 API Rate limit."); break; }
      if (!res.ok) { console.error(`❌ API Error: ${res.status}`); break; }

      const apiGames = await res.json();
      if (!Array.isArray(apiGames) || apiGames.length === 0) break;

      for (const apiGame of apiGames) {
        if (!apiGame.name) continue;

        // On nettoie le titre OpenCritic
        const cleanTitle = apiGame.name.trim();
        const apiReleaseDateStr = apiGame.firstReleaseDate || null;

        // A. EXISTE DÉJÀ ? (Titre + Année)
        const match = knownGames.find(local => isMatch(local, cleanTitle, apiReleaseDateStr));

        if (match) {
          // UPDATE (Maintenance)
          const newScore = apiGame.topCriticScore ? Math.round(apiGame.topCriticScore) : null;
          // Update if score differs
          if (newScore && match.opencriticScore !== newScore) {
            console.log(`   🔄 UPDATING: "${match.title}" (Score: ${newScore})`);
            await prisma.game.update({
                where: { id: match.id },
                data: {
                    opencriticScore: newScore,
                    // Also update URL if available, as user script missed it
                    ...(apiGame.url ? { opencriticUrl: apiGame.url } : {})
                }
            });
            gamesUpdated++;
            match.opencriticScore = newScore;
          }
        }
        else {
          // B. NOUVEAU JEU (Création + Enrichment)
          console.log(`   ✨ CREATING: "${cleanTitle}"...`);

          const releaseYear = apiReleaseDateStr ? new Date(apiReleaseDateStr).getFullYear() : null;

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

          if (!newGameId) {
             newGameId = `opencritic-${apiGame.id}`;
          }

          // Check for collision by ID (in case title match failed but ID exists)
          const existingById = await prisma.game.findUnique({ where: { id: newGameId } });
          if (existingById) {
               console.log(`      ⚠️ Game exists by ID (${newGameId}) but title mismatch. Skipping creation.`);
               continue;
          }

          const releaseDate = apiReleaseDateStr ? new Date(apiReleaseDateStr) : null;
          const opencriticScore = apiGame.topCriticScore ? Math.round(apiGame.topCriticScore) : null;

          // 3. Insertion en base
          await prisma.game.create({
            data: {
                id: newGameId,
                title: cleanTitle,
                releaseDate: releaseDate,

                // Données OpenCritic
                opencriticScore: opencriticScore,
                opencriticUrl: apiGame.url || `https://opencritic.com/game/${apiGame.id}/${normalize(cleanTitle)}`,

                // Données Enrichies (Images)
                coverImage: art?.cover || null,
                backgroundImage: art?.background || null,

                // Données Enrichies (Texte)
                description: meta.description,
                genres: meta.genres, // Stringified JSON
                platforms: meta.platforms, // Object/Array for Json type

                // Flags
                dataFetched: true,
                updatedAt: new Date(),

                // Helper IDs
                igdbId: (meta.igdbId || (art?.source === 'igdb' ? String((art.originalData as any).id) : null))
            }
          });

          gamesCreated++;
          knownGames.push({
              id: newGameId,
              title: cleanTitle,
              opencriticScore: opencriticScore,
              releaseDate: releaseDate
          });
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

  console.log("\n--- SUMMARY ---");
  console.log(`Pages scanned: ${pagesProcessed}`);
  console.log(`Games Created: ${gamesCreated}`);
  console.log(`Games Updated: ${gamesUpdated}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
