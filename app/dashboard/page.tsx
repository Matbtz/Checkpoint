import { getUserLibrary } from '@/actions/dashboard';
import { getUserPreferences } from '@/actions/user';
import { getUserTags } from '@/actions/tag';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default async function DashboardPage() {
  const [library, prefs, tags] = await Promise.all([
      getUserLibrary(),
      getUserPreferences(),
      getUserTags()
  ]);

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Ma Bibliothèque</h1>
      <Dashboard
        initialLibrary={library}
        userPaceFactor={prefs.pace}
        availableTags={tags}
      />
    </div>
  );
}
