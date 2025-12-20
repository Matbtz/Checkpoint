import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOwnedGames } from '@/lib/steam';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Security check: Verify Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Find all users with a Steam ID linked
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

    // 2. Process users in chunks to avoid hitting execution limits
    const CHUNK_SIZE = 5;

    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
        const chunk = users.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (user) => {
            // Resolve Steam ID
            let steamId = user.steamId;
            if (!steamId && user.accounts) {
                const steamAccount = user.accounts.find(acc => acc.provider === 'steam');
                if (steamAccount) {
                    steamId = steamAccount.providerAccountId;
                }
            }

            if (!steamId) return;

            try {
                const steamGames = await getOwnedGames(steamId);

                // Get all existing library entries for this user with status
                const libraryEntries = await prisma.userLibrary.findMany({
                    where: { userId: user.id },
                    select: { gameId: true, playtimeSteam: true, status: true }
                });

                const libraryMap = new Map(libraryEntries.map(e => [e.gameId, e]));

                // Map steam games to library entries
                const gamesToUpdate = steamGames.filter(g => libraryMap.has(g.appid.toString()));

                // Process game updates for this user
                // We use Promise.all here as well since DB writes are IO bound
                await Promise.all(gamesToUpdate.map(async (game) => {
                    const entry = libraryMap.get(game.appid.toString());
                    if (!entry) return;

                    const dataToUpdate: Prisma.UserLibraryUpdateInput = {
                        playtimeSteam: game.playtime_forever
                    };

                    // Flip status from Backlog to Playing if playtime > 0
                    if (game.playtime_forever > 0 &&
                       (entry.status === 'Backlog' || entry.status === 'BACKLOG')) {
                        dataToUpdate.status = 'Playing';
                    }

                    if (entry.playtimeSteam !== game.playtime_forever || dataToUpdate.status) {
                        await prisma.userLibrary.update({
                            where: {
                                userId_gameId: {
                                    userId: user.id,
                                    gameId: game.appid.toString()
                                }
                            },
                            data: dataToUpdate
                        });
                    }
                }));

                updatedUsers++;
            } catch (error) {
                console.error(`Failed to sync user ${user.id}:`, error);
                errors++;
            }
        }));
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
