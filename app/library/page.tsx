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
      <h1 className="text-3xl font-bold mb-6">Games Library</h1>
      <Dashboard
        initialLibrary={library}
        userPaceFactor={prefs.pace}
      />
    </div>
  );
}
