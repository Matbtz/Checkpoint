import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
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

        const body = await req.json();
        const { gameId, playtime, status } = body;

        if (!gameId) {
            return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
        }

        // Validate Status if provided
        const validStatuses = ['BACKLOG', 'PLAYING', 'COMPLETED', 'ABANDONED', 'WISHLIST'];
        if (status && !validStatuses.includes(status)) {
             return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        // Check ownership
        const existingEntry = await prisma.userLibrary.findUnique({
            where: {
                userId_gameId: {
                    userId: user.id,
                    gameId: gameId,
                }
            }
        });

        if (!existingEntry) {
            return NextResponse.json({ error: 'Game not found in user library' }, { status: 404 });
        }

        // Prepare update data
        const updateData: any = {};

        // If playtime provided (in minutes), update manual playtime and set manual flag if needed
        if (typeof playtime === 'number') {
            updateData.playtimeManual = playtime;
            // We might want to set isManualProgress to true, but schema says UserLibrary has progressManual (int percentage)
            // The request says "le playtime (et implicitement la date de dernière activité lastActivity / updatedAt)"
            updateData.lastPlayed = new Date();
        }

        if (status) {
            updateData.status = status;
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.userLibrary.update({
                where: {
                    userId_gameId: {
                        userId: user.id,
                        gameId: gameId,
                    }
                },
                data: updateData
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Widget API Update Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
