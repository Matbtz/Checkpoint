import { auth } from '@/auth';
import { fetchSteamGames } from '@/actions/steam';
import ImportInterface from '@/components/import/import-interface';
import { redirect } from 'next/navigation';

export default async function ImportPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  let games;
  let error;

  try {
    games = await fetchSteamGames();
  } catch (e: unknown) {
      if (e instanceof Error) {
        error = e.message;
      } else {
          error = 'Unknown error occurred';
      }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 dark:bg-black px-4 py-12">
        <div className="w-full max-w-5xl">
            <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">Import Steam Games</h1>

            {error ? (
                <div className="rounded-md bg-yellow-50 p-4 mb-4 border border-yellow-200">
                    <div className="flex">
                         <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800">Steam Import Unavailable</h3>
                            <div className="mt-2 text-sm text-yellow-700">
                                <p>{error}</p>
                                {error === 'Steam account not linked' && (
                                    <p className="mt-2">
                                        Please <a href="/login" className="font-bold underline">link your Steam account</a> to import your library.
                                    </p>
                                )}
                            </div>
                         </div>
                    </div>
                </div>
            ) : (
                <ImportInterface initialGames={games || []} />
            )}
        </div>
    </div>
  );
}
