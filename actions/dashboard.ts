'use server';

import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function getUserLibrary() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  const library = await prisma.userLibrary.findMany({
    where: {
      userId: userId,
    },
    include: {
      game: true,
      tags: true,
    },
    orderBy: {
      dateAdded: 'desc',
    },
  });

  return library;
}
