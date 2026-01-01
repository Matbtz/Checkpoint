import { SyncSteamButton } from '@/components/dashboard/SyncSteamButton';
import { getUserLibrary } from '@/actions/dashboard';
import { getUserPreferences } from '@/actions/user';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default async function LibraryPage() {
  const [library, prefs] = await Promise.all([
    getUserLibrary(),
    getUserPreferences(),

  ]);

  return (
    <div className="container mx-auto py-4 px-2 md:py-8 md:px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Games Library</h1>
        <SyncSteamButton />
      </div>
      <Dashboard
        initialLibrary={library}
        userPaceFactor={prefs.pace}
      />
    </div>
  );
}
