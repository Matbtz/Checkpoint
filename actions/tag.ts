'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function createTag(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;

  try {
    const tag = await prisma.tag.create({
      data: {
        name,
        userId
      }
    });
    revalidatePath('/dashboard');
    revalidatePath('/settings');
    return { success: true, tag };
  } catch (error) {
    console.error('Error creating tag', error);
    return { success: false, error: 'Could not create tag' };
  }
}

export async function deleteTag(tagId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');

  const userId = session.user.id;

  try {
    await prisma.tag.deleteMany({
      where: {
        id: tagId,
        userId: userId // Security check
      }
    });
    revalidatePath('/dashboard');
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    console.error('Error deleting tag', error);
    return { success: false, error: 'Could not delete tag' };
  }
}

export async function assignTag(libraryId: string, tagId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    try {
        await prisma.userLibrary.update({
            where: { id: libraryId, userId: session.user.id },
            data: {
                tags: {
                    connect: { id: tagId }
                }
            }
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Error assigning tag', error);
        return { success: false, error: 'Failed' };
    }
}

export async function removeTag(libraryId: string, tagId: string) {
    const session = await auth();
    if (!session?.user?.id) throw new Error('Unauthorized');

    try {
        await prisma.userLibrary.update({
            where: { id: libraryId, userId: session.user.id },
            data: {
                tags: {
                    disconnect: { id: tagId }
                }
            }
        });
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error) {
        console.error('Error removing tag', error);
        return { success: false, error: 'Failed' };
    }
}

export async function getUserTags() {
    const session = await auth();
    if (!session?.user?.id) return [];

    return prisma.tag.findMany({
        where: { userId: session.user.id },
        orderBy: { name: 'asc' }
    });
}
