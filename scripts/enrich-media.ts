
import { PrismaClient } from '@prisma/client';
import { findBestGameArt } from '../lib/enrichment';

const prisma = new PrismaClient();
const DELAY_MS = 1000;

async function main() {
  console.log("🎨 Recherche d'Artwork Intelligente (Steam > IGDB > RAWG)...");

  // On cible les jeux sans images
  const games = await prisma.game.findMany({
    where: {
      OR: [{ coverImage: null }, { backgroundImage: null }]
    }
  });

  console.log(`Traitement de ${games.length} jeux...`);

  for (const game of games) {
    const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

    console.log(`\n🔍 ${game.title} (${releaseYear || '?'})`);

    // Appel de la nouvelle fonction "Best Match"
    const art = await findBestGameArt(game.title, releaseYear);

    if (art) {
        console.log(`   ✅ Trouvé via [${art.source.toUpperCase()}]`);

        await prisma.game.update({
            where: { id: game.id },
            data: {
                coverImage: art.cover || game.coverImage,
                backgroundImage: art.background || game.backgroundImage,
                dataFetched: true
            }
        });
    } else {
        console.log(`   ❌ Aucun match strict trouvé.`);
    }

    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
