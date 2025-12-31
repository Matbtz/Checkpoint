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

export async function getUserPreferences() {
    const session = await auth();
    if (!session?.user?.id) return { pace: 1.0 }; // Default

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { preferences: true }
    });

    try {
        if (user?.preferences) {
            const parsed = JSON.parse(user.preferences);
            return {
                pace: typeof parsed.pace === 'number' ? parsed.pace : 1.0
            };
        }
    } catch {}

    return { pace: 1.0 };
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
