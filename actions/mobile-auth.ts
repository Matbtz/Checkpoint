'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

export async function generateMobileKey() {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Unauthorized' };
  }

  // Generate a 32-character hex key (16 bytes)
  const mobileKey = crypto.randomBytes(16).toString('hex');

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { mobileKey },
    });
    return { success: true, mobileKey };
  } catch (error) {
    console.error('Failed to generate mobile key:', error);
    return { success: false, error: 'Failed to generate key' };
  }
}
