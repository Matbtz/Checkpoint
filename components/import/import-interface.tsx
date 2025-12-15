'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SteamGame } from '@/lib/steam';
import { importGames } from '@/actions/steam';

export default function ImportInterface({ initialGames }: { initialGames: SteamGame[] }) {
  const router = useRouter();
  const [games] = useState<SteamGame[]>(initialGames);
  const [minPlaytime, setMinPlaytime] = useState(0);
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set(initialGames.map(g => g.appid)));
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');

  const filteredGames = games.filter(g => g.playtime_forever >= minPlaytime * 60);

  const handleToggleSelect = (appid: number) => {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(appid)) {
      newSelected.delete(appid);
    } else {
      newSelected.add(appid);
    }
    setSelectedGames(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGames.size === filteredGames.length) {
        setSelectedGames(new Set());
    } else {
        setSelectedGames(new Set(filteredGames.map(g => g.appid)));
    }
  }

  const handleImport = async () => {
    setIsImporting(true);
    setMessage('');
    try {
      const gamesToImport = filteredGames.filter(g => selectedGames.has(g.appid));
      const result = await importGames(gamesToImport);
      setMessage(`Successfully imported ${result.count} games!`);
      router.refresh();
      router.push('/dashboard');
    } catch (error) {
      setMessage('Error importing games.');
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-lg shadow">
        <div>
           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
             Minimum Playtime (hours)
           </label>
           <input
             type="number"
             min="0"
             value={minPlaytime}
             onChange={(e) => setMinPlaytime(Number(e.target.value))}
             className="block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 pl-2"
           />
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredGames.length} games
        </div>
        <button
          onClick={handleImport}
          disabled={isImporting || filteredGames.length === 0}
          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
        >
          {isImporting ? 'Importing...' : 'Import Selected'}
        </button>
      </div>

      {message && (
          <div className={`p-4 rounded-md ${message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {message}
          </div>
      )}

      <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-zinc-800">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-200 sm:pl-6">
                <input
                    type="checkbox"
                    checked={selectedGames.size === filteredGames.length && filteredGames.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                Game
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                Playtime (Hours)
              </th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-gray-200">
                Steam AppID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-zinc-900">
            {filteredGames.map((game) => (
              <tr key={game.appid}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-gray-200 sm:pl-6">
                   <input
                    type="checkbox"
                    checked={selectedGames.has(game.appid)}
                    onChange={() => handleToggleSelect(game.appid)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {game.name}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {(game.playtime_forever / 60).toFixed(1)} h
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {game.appid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
