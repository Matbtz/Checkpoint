import { NextRequest, NextResponse } from 'next/server';
import { getOwnedGames } from '@/lib/steam';
import { importGamesInternal } from '@/lib/steam-import';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  // 1. Verify NODE_ENV
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Endpoint only available in test/development' }, { status: 403 });
  }

  // 2. Parse steamId from query
  const searchParams = request.nextUrl.searchParams;
  let steamId = searchParams.get('steamId');
  const providedSteamId = process.env.TEST_STEAM_ID;

  if (!steamId) {
    steamId = providedSteamId || null;
  }

  if (!steamId) {
    return NextResponse.json({ error: 'steamId is required (query param or TEST_STEAM_ID env var)' }, { status: 400 });
  }

  try {
    // 3. Find or Create User
    // For test purposes, we'll try to find a user who has this steamId linked,
    // OR just use the first user in the DB,
    // OR create a dummy user.

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { steamId: steamId },
          { accounts: { some: { provider: 'steam', providerAccountId: steamId } } }
        ]
      }
    });

    if (!user) {
        // Fallback: get the first user in DB to attach games to
        user = await prisma.user.findFirst();
    }

    if (!user) {
      // Create a dummy user if absolutely no users exist
      user = await prisma.user.create({
        data: {
            email: `test-user-${Date.now()}@example.com`,
            steamId: steamId,
        }
      });
    }

    const userId = user.id;

    // 4. Call getOwnedGames
    console.log(`Fetching games for SteamID: ${steamId}`);
    const games = await getOwnedGames(steamId);
    console.log(`Found ${games.length} games`);

    // Limit games for test performance if needed
    const limit = searchParams.get('limit');
    const gamesToImport = limit ? games.slice(0, parseInt(limit)) : games;

    // 5. Call importGamesInternal
    console.log(`Importing ${gamesToImport.length} games for UserID: ${userId}`);
    const importResult = await importGamesInternal(userId, gamesToImport);

    return NextResponse.json({
      success: true,
      steamId,
      userId,
      gamesFound: games.length,
      gamesImported: gamesToImport.length,
      importResult
    });

  } catch (error: any) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
