'use server';

import { auth } from '@/auth';
import { getOwnedGames, SteamGame } from '@/lib/steam';
import { prisma } from '@/lib/db';
import { importGamesInternal } from '@/lib/steam-import';

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

export async function importGames(games: SteamGame[]) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('Not authenticated');
  }

  return importGamesInternal(userId, games);
}
