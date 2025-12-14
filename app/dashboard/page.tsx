import { getUserLibrary } from '@/actions/dashboard';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default async function DashboardPage() {
  const library = await getUserLibrary();

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Ma Bibliothèque</h1>
      <Dashboard initialLibrary={library} />
    </div>
  );
}
