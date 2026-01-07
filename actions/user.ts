'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function updateUserPace(paceFactor: number) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    // Validate range (0.5 to 1.5)
    if (paceFactor < 0.5 || paceFactor > 1.5) {
        throw new Error('Invalid pace factor');
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true }
    });

    let prefs = {};
    try {
        if (user?.preferences) {
            prefs = JSON.parse(user.preferences);
        }
    } catch (e) {
        // ignore
    }

    const newPrefs = {
        ...prefs,
        pace: paceFactor
    };

    await prisma.user.update({
        where: { id: session.user.id },
        data: { preferences: JSON.stringify(newPrefs) }
    });

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return { success: true };
}

export async function updateUserDefaultCompletionGoal(goal: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    const validGoals = ['Main', 'Extra', '100%'];
    if (!validGoals.includes(goal)) {
        throw new Error('Invalid completion goal');
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true }
    });

    let prefs = {};
    try {
        if (user?.preferences) {
            prefs = JSON.parse(user.preferences);
        }
    } catch (e) {
        // ignore
    }

    const newPrefs = {
        ...prefs,
        defaultCompletionGoal: goal
    };

    await prisma.user.update({
        where: { id: session.user.id },
        data: { preferences: JSON.stringify(newPrefs) }
    });

    revalidatePath('/settings');
    return { success: true };
}

export async function getUserPreferences() {
    const session = await auth();
    if (!session?.user?.id) return { pace: 1.0, defaultCompletionGoal: 'Main' }; // Default

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true }
    });

    try {
        if (user?.preferences) {
            const parsed = JSON.parse(user.preferences);
            return {
                pace: typeof parsed.pace === 'number' ? parsed.pace : 1.0,
                defaultCompletionGoal: typeof parsed.defaultCompletionGoal === 'string' ? parsed.defaultCompletionGoal : 'Main'
            };
        }
    } catch { }

    return { pace: 1.0, defaultCompletionGoal: 'Main' };
}

export async function searchUsers(query: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    if (!query || query.length < 2) return [];

    const users = await prisma.user.findMany({
        where: {
            OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
            ],
            // Exclude self
            NOT: {
                id: session.user.id
            }
        },
        select: {
            id: true,
            name: true,
            image: true,
        },
        take: 5
    });

    // Check which are already friends
    const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: {
            following: {
                select: { id: true }
            }
        }
    });

    const followingIds = new Set(currentUser?.following.map(u => u.id) || []);

    return users.map(user => ({
        ...user,
        isFollowing: followingIds.has(user.id)
    }));
}

export async function followUser(targetUserId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    if (session.user.id === targetUserId) throw new Error("Cannot follow self");

    // Add to following
    await prisma.user.update({
        where: { id: session.user.id },
        data: {
            following: {
                connect: { id: targetUserId }
            }
        }
    });

    revalidatePath('/profile');
}

export async function getUserPlatforms() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { platforms: true }
    });

    return user?.platforms || [];
}

export async function updateUserPlatforms(platforms: string[]) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    await prisma.user.update({
        where: { id: session.user.id },
        data: { platforms }
    });

    revalidatePath('/settings');
    revalidatePath('/'); // Revalidate homepage so discovery sections update
    return { success: true };
}
