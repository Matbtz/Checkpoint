import { getUserPreferences } from '@/actions/user';
import { getUserTags } from '@/actions/tag';
import SettingsClient from '@/components/dashboard/SettingsClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export default async function SettingsPage() {
    const session = await auth();
    const prefs = await getUserPreferences();
    const tags = await getUserTags();

    let accounts: { provider: string; providerAccountId: string }[] = [];
    let userSteamId: string | null | undefined = null;
    let userPlatforms: string[] = [];

    if (session?.user?.id) {
        // Fetch User to get steamId and platforms
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { steamId: true, platforms: true }
        });
        userSteamId = user?.steamId;
        userPlatforms = user?.platforms || [];

        // Fetch Accounts
        accounts = await prisma.account.findMany({
            where: { userId: session.user.id },
            select: { provider: true, providerAccountId: true }
        });
    }

    return (
        <SettingsClient
            initialPace={prefs.pace}
            initialTags={tags}
            initialAccounts={accounts}
            userSteamId={userSteamId}
            initialPlatforms={userPlatforms}
        />
    );
}
