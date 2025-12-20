import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOwnedGames } from '@/lib/steam';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Security check: Verify Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Find all users with a Steam ID linked (either directly or via Account)
    const users = await prisma.user.findMany({
      where: {
        OR: [
            { steamId: { not: null } },
            { accounts: { some: { provider: 'steam' } } }
        ]
      },
      include: {
        accounts: true,
      },
    });

    console.log(`Starting Steam sync for ${users.length} users`);

    let updatedUsers = 0;
    let errors = 0;

    // 2. Iterate users and sync
    // Note: This iterates all users sequentially. For a large user base,
    // this should be refactored to use a job queue or processed in batches.
    for (const user of users) {
      // Resolve Steam ID
      let steamId = user.steamId;
      if (!steamId && user.accounts) {
        const steamAccount = user.accounts.find(acc => acc.provider === 'steam');
        if (steamAccount) {
            steamId = steamAccount.providerAccountId;
        }
      }

      if (!steamId) continue;

      try {
        const steamGames = await getOwnedGames(steamId);

        // Get all existing library entries for this user
        const libraryEntries = await prisma.userLibrary.findMany({
            where: { userId: user.id },
            select: { gameId: true, playtimeSteam: true }
        });

        const libraryGameIds = new Set(libraryEntries.map(e => e.gameId));

        // Map steam games to library entries
        const gamesToUpdate = steamGames.filter(g => libraryGameIds.has(g.appid.toString()));

        for (const game of gamesToUpdate) {
            await prisma.userLibrary.update({
                where: {
                    userId_gameId: {
                        userId: user.id,
                        gameId: game.appid.toString()
                    }
                },
                data: {
                    playtimeSteam: game.playtime_forever
                }
            });
        }
        updatedUsers++;
      } catch (error) {
        console.error(`Failed to sync user ${user.id}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      processed: users.length,
      updated: updatedUsers,
      errors
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Steam sync cron failed:', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
