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
