import { prisma } from '@/lib/db';
import { SteamGame } from '@/lib/steam';

export async function importGamesInternal(userId: string, games: SteamGame[]) {
  let importedCount = 0;

  for (const game of games) {
    // Upsert Game
    await prisma.game.upsert({
      where: { id: game.appid.toString() },
      update: {
        title: game.name,
        coverImage: `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`,
      },
      create: {
        id: game.appid.toString(),
        title: game.name,
        coverImage: `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`,
        dataMissing: true,
      },
    });

    // Upsert UserLibrary
    try {
      await prisma.userLibrary.create({
        data: {
          userId: userId,
          gameId: game.appid.toString(),
          status: 'Backlog', // Default status
          playtimeSteam: game.playtime_forever,
        },
      });
      importedCount++;
    } catch {
      // Probably already exists
      await prisma.userLibrary.update({
        where: {
          userId_gameId: {
            userId: userId,
            gameId: game.appid.toString(),
          },
        },
        data: {
          playtimeSteam: game.playtime_forever,
        },
      });
      importedCount++;
    }
  }

  return { success: true, count: importedCount };
}
