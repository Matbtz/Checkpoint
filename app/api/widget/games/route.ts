import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const mobileKey = authHeader.replace('Bearer ', '');

    try {
        const user = await prisma.user.findUnique({
            where: { mobileKey },
        });

        if (!user) {
            return NextResponse.json({ error: 'Invalid mobile key' }, { status: 401 });
        }

        // Fetch PLAYING and BACKLOG games for the user
        const games = await prisma.userLibrary.findMany({
            where: {
                userId: user.id,
                status: {
                    in: ['PLAYING', 'BACKLOG']
                }
            },
            include: {
                game: {
                    select: {
                        id: true,
                        title: true,
                        coverImage: true,
                        backgroundImage: true,
                    }
                }
            },
            orderBy: {
                // Priority: Playing first, then recently played, then created
                lastPlayed: 'desc',
            }
        });

        // Format for the widget
        const widgetGames = games.map(entry => ({
            id: entry.gameId,
            title: entry.game.title,
            cover: entry.customCoverImage || entry.game.coverImage,
            background: entry.game.backgroundImage,
            status: entry.status,
            playtime: entry.playtimeManual ?? entry.playtimeSteam, // Use manual override if set, otherwise steam
            playtime_display: `${Math.round((entry.playtimeManual ?? entry.playtimeSteam) / 60)}h`,
        }));

        return NextResponse.json(widgetGames);

    } catch (error) {
        console.error('Widget API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
