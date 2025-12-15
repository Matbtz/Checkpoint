
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enrichGameData } from '@/actions/enrich';
import { auth } from '@/lib/auth';

export async function POST(req: Request) {
  // Ensure the user is authenticated
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { gameIds } = await req.json();

    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      return NextResponse.json({ error: 'Invalid game IDs' }, { status: 400 });
    }

    const idsToProcess = gameIds.slice(0, 5);
    const results = [];

    for (let i = 0; i < idsToProcess.length; i++) {
      const gameId = idsToProcess[i];
      try {
        const game = await prisma.game.findUnique({
          where: { id: gameId },
          select: { id: true, title: true },
        });

        if (game) {
          const result = await enrichGameData(game.id, game.title);
          results.push({ id: game.id, success: result.success });
        } else {
            results.push({ id: gameId, success: false, error: 'Game not found' });
        }
      } catch (err) {
        console.error(`Error enriching game ${gameId}:`, err);
        results.push({ id: gameId, success: false, error: 'Enrichment failed' });
      }

      // Add delay between requests, but not after the last one
      if (i < idsToProcess.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Batch enrichment error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
