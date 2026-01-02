'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function disconnectAccount(provider: string, shouldDeleteGames: boolean) {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Non authentifié" }
  }

  try {
    // 1. Delete the Account connection
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: provider
      }
    })

    // 2. Specific cleanup for Steam
    if (provider === 'steam') {
        // Clear steamId from User profile
        await prisma.user.update({
            where: { id: session.user.id },
            data: { steamId: null }
        })

        // 3. Delete imported games if requested
        if (shouldDeleteGames) {
            // Delete UserLibrary entries where the game has a steamAppId
            await prisma.userLibrary.deleteMany({
                where: {
                    userId: session.user.id,
                    game: {
                        steamAppId: { not: null }
                    }
                }
            })
        }
    }

    revalidatePath('/settings')
    return { success: true }
  } catch (error) {
    console.error("Error disconnecting account:", error)
    return { success: false, error: "Une erreur est survenue" }
  }
}
