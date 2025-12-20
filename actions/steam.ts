'use server';

import { auth } from '@/auth';
import { getOwnedGames, SteamGame } from '@/lib/steam';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function fetchSteamGames() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Not authenticated');
  }

  // Get steamId from user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: true },
  });

  let steamId = user?.steamId;

  // If not in user table, check accounts
  if (!steamId && user?.accounts) {
    const steamAccount = user.accounts.find(acc => acc.provider === 'steam');
    if (steamAccount) {
      steamId = steamAccount.providerAccountId;
    }
  }

  if (!steamId) {
    throw new Error('Steam account not linked');
  }

  try {
     const games = await getOwnedGames(steamId);
     return games;
  } catch (e) {
      console.error(e);
      // Mock data for development if API fails or not set
      if (process.env.NODE_ENV === 'development') {
          return [
              { appid: 10, name: 'Counter-Strike', playtime_forever: 3000, img_icon_url: '' },
              { appid: 20, name: 'Team Fortress Classic', playtime_forever: 100, img_icon_url: '' },
              { appid: 70, name: 'Half-Life', playtime_forever: 500, img_icon_url: '' },
              { appid: 400, name: 'Portal', playtime_forever: 0, img_icon_url: '' }
          ] as unknown as SteamGame[];
      }
      throw e;
  }
}

export async function getSteamImportCandidates() {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // 1. Fetch all steam games
    const steamGames = await fetchSteamGames();

    // 2. Fetch user's current library game IDs
    const userLibrary = await prisma.userLibrary.findMany({
        where: { userId: userId },
        select: { gameId: true }
    });

    const existingGameIds = new Set(userLibrary.map(entry => entry.gameId));

    // 3. Filter out games already in library
    // Steam Game ID is typically the 'appid'
    const candidates = steamGames.filter(game => !existingGameIds.has(game.appid.toString()));

    return candidates;
}

export async function importGames(games: SteamGame[]) {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
        throw new Error('Not authenticated');
    }

    // Process imports
    // 1. Create Game entries if not exist
    // 2. Create UserLibrary entries

    let importedCount = 0;

    for (const game of games) {
        // Upsert Game
        await prisma.game.upsert({
            where: { id: game.appid.toString() },
            update: {
                title: game.name,
                coverImage: `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`
            },
            create: {
                id: game.appid.toString(),
                title: game.name,
                coverImage: `https://steamcdn-a.akamaihd.net/steam/apps/${game.appid}/library_600x900.jpg`,
                dataMissing: true
            }
        });

        // Upsert UserLibrary
        try {
            const status = game.playtime_forever > 0 ? 'PLAYING' : 'BACKLOG';

            await prisma.userLibrary.create({
                data: {
                    userId: userId,
                    gameId: game.appid.toString(),
                    status: status,
                    playtimeSteam: game.playtime_forever,
                    targetedCompletionType: 'MAIN'
                }
            });
            importedCount++;
        } catch {
            // Probably already exists
             await prisma.userLibrary.update({
                where: {
                    userId_gameId: {
                        userId: userId,
                        gameId: game.appid.toString()
                    }
                },
                data: {
                    playtimeSteam: game.playtime_forever
                }
            });
            importedCount++;
        }
    }

    return { success: true, count: importedCount };
}
