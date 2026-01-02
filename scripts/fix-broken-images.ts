
import { prisma } from "../lib/db";
import { findBestGameArt } from "../lib/enrichment";
import { extractDominantColors } from "../lib/color-utils";

async function main() {
    console.log("Starting Broken Image Fixer...");

    // 1. Find broken games
    const brokenGames = await prisma.game.findMany({
        where: {
            imageStatus: 'BROKEN'
        },
        take: 50 // Batch size
    });

    console.log(`Found ${brokenGames.length} games with broken images.`);

    if (brokenGames.length === 0) {
        console.log("No broken images to fix.");
        return;
    }

    for (const game of brokenGames) {
        console.log(`Fixing: ${game.title} (${game.id})...`);

        try {
            let excludedSources: string[] = [];
            let art = null;
            let retries = 0;
            const MAX_RETRIES = 3;

            while (retries < MAX_RETRIES) {
                console.log(`    Trying fetch (Excluding: ${excludedSources.join(', ') || 'None'})...`);
                art = await findBestGameArt(game.title, null, excludedSources);

                if (!art) {
                    console.log("    -> No art found from any remaining source.");
                    break;
                }

                // Check if the new URL is the same as the broken one
                if (art.cover === game.coverImage) {
                    console.log(`    -> Source '${art.source}' returned the SAME broken url. Switching provider...`);
                    excludedSources.push(art.source);
                    retries++;
                    continue;
                }

                // Found a new image!
                break;
            }

            if (art && art.cover !== game.coverImage) {
                let primaryColor = game.primaryColor;
                let secondaryColor = game.secondaryColor;

                // Try to extract colors if we have a cover
                // (Optional: skip to save time/resources if not critical)
                try {
                    if (art.cover) {
                        const colors = await extractDominantColors(art.cover);
                        if (colors) {
                            primaryColor = colors.primary;
                            secondaryColor = colors.secondary;
                        }
                    }
                } catch (e) {
                    // Ignore color error
                }


                await prisma.game.update({
                    where: { id: game.id },
                    data: {
                        coverImage: art.cover,
                        backgroundImage: art.background, // might as well update this too
                        imageStatus: 'OK', // Reset status
                        primaryColor,
                        secondaryColor,
                        updatedAt: new Date()
                    }
                });
                console.log(`  -> Fixed! New Source: ${art.source}`);
                console.log(`  -> URL: ${art.cover}`);
            } else {
                console.log("  -> Failed to find a BETTER image after retries.");
            }
        } catch (error) {
            console.error(`  -> Failed to fix ${game.title}:`, error);
        }

        // Small delay
        await new Promise(r => setTimeout(r, 500));
    }

    console.log("Batch complete.");
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
