'use client';

import { useState, useEffect } from 'react';
import { type UserLibrary, type Game } from '@prisma/client';
import { GameCard } from './GameCard';
import { calculateProgress } from '@/lib/format-utils';
import { ManualAddModal } from './ManualAddModal';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Tag } from '@prisma/client';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface DashboardProps {
  initialLibrary: GameWithLibrary[];
  userPaceFactor?: number;
  availableTags?: Tag[];
}

type SortOption = 'dateAdded' | 'progress' | 'releaseDate';
type StatusFilter = 'All' | 'Playing' | 'Backlog' | 'Completed' | 'Wishlist' | 'Abandoned';
type PlaytimeFilter = 'All' | '0-10h' | '10-50h' | '50-100h' | '100h+';
type PlatformFilter = 'All' | 'Steam' | 'Manual'; // Since we don't have explicit platform field yet, we rely on data source indicators

export function Dashboard({ initialLibrary, userPaceFactor = 1.0, availableTags = [] }: DashboardProps) {
  // Use local state if we plan to implement client-side deletion/updates later.
  const [library, setLibrary] = useState<GameWithLibrary[]>(initialLibrary);

  useEffect(() => {
    setLibrary(initialLibrary);
  }, [initialLibrary]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [playtimeFilter, setPlaytimeFilter] = useState<PlaytimeFilter>('All');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded');

  const [isManualAddOpen, setIsManualAddOpen] = useState(false);

  // Filter
  const filteredLibrary = library.filter(item => {
    // Status Filter
    if (statusFilter !== 'All' && item.status !== statusFilter) return false;

    // Platform Filter
    // Logic: If playTimeSteam > 0 or we can infer it's from steam (e.g. steamId on user, but item doesn't have it).
    // Actually, UserLibrary has `playTimeSteam`. If it's not null, it's likely Steam.
    // `playTimeManual` implies Manual.
    if (platformFilter === 'Steam') {
        if (!item.playTimeSteam && item.playTimeSteam !== 0) return false; // Basic check
        // Or strictly:
        // if (item.playTimeSteam === null) return false;
    }
    if (platformFilter === 'Manual') {
        // Assume anything with manual time or just not steam?
        // Let's assume if manual time is set and > 0, or if we want to filter by "Added manually".
        // The prompt says "par plateforme".
        // Since we don't have a "Platform" field, this is best effort.
        if (item.playTimeManual === null && item.playTimeSteam !== null) return false;
    }

    // Tag Filter
    if (tagFilter !== 'All') {
        if (!item.tags || !item.tags.some(t => t.id === tagFilter)) return false;
    }

    // Playtime Filter
    if (playtimeFilter !== 'All') {
        const minutes = item.playTimeManual ?? item.playTimeSteam ?? 0;
        const hours = minutes / 60;
        switch (playtimeFilter) {
            case '0-10h':
                if (hours > 10) return false;
                break;
            case '10-50h':
                if (hours <= 10 || hours > 50) return false;
                break;
            case '50-100h':
                if (hours <= 50 || hours > 100) return false;
                break;
            case '100h+':
                if (hours <= 100) return false;
                break;
        }
    }

    return true;
  });

  // Sort
  const sortedLibrary = [...filteredLibrary].sort((a, b) => {
    switch (sortBy) {
      case 'dateAdded':
        // Newest first
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
      case 'progress':
        // Highest progress first
        const progressA = calculateProgress(a.playTimeManual ?? a.playTimeSteam ?? 0, a.game.hltbTimes, a.targetedCompletionType || 'Main');
        const progressB = calculateProgress(b.playTimeManual ?? b.playTimeSteam ?? 0, b.game.hltbTimes, b.targetedCompletionType || 'Main');
        return progressB - progressA;
      case 'releaseDate':
        // Newest release first (or future first?)
        const dateA = a.game.releaseDate ? new Date(a.game.releaseDate).getTime() : 0;
        const dateB = b.game.releaseDate ? new Date(b.game.releaseDate).getTime() : 0;
        return dateB - dateA;
      default:
        return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Filters & Sort Bar */}
      <div className="flex flex-col gap-4 bg-white dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">

        {/* Row 1: Status Filters */}
        <div className="flex flex-wrap gap-2 justify-between items-center">
            <div className="flex flex-wrap gap-2">
                <span className="text-sm font-medium text-zinc-500 my-auto mr-2">Statut:</span>
                {(['All', 'Playing', 'Backlog', 'Completed', 'Wishlist', 'Abandoned'] as StatusFilter[]).map((status) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            statusFilter === status
                            ? 'bg-blue-600 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>
            <Button size="sm" onClick={() => setIsManualAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Game
            </Button>
        </div>

        {/* Row 2: Other Filters & Sort */}
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
                {/* Platform Filter */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">Plateforme:</span>
                    <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
                        className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1"
                    >
                        <option value="All">Toutes</option>
                        <option value="Steam">Steam</option>
                        <option value="Manual">Manuel</option>
                    </select>
                </div>

                {/* Tag Filter */}
                {availableTags && availableTags.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-500">Tag:</span>
                        <select
                            value={tagFilter}
                            onChange={(e) => setTagFilter(e.target.value)}
                            className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1"
                        >
                            <option value="All">Tous</option>
                            {availableTags.map(tag => (
                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Playtime Filter */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">Temps de jeu:</span>
                    <select
                        value={playtimeFilter}
                        onChange={(e) => setPlaytimeFilter(e.target.value as PlaytimeFilter)}
                        className="text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1"
                    >
                        <option value="All">Tous</option>
                        <option value="0-10h">0 - 10h</option>
                        <option value="10-50h">10 - 50h</option>
                        <option value="50-100h">50 - 100h</option>
                        <option value="100h+">100h+</option>
                    </select>
                </div>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">Trier par:</span>
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-sm bg-transparent border-none focus:ring-0 cursor-pointer font-medium text-zinc-800 dark:text-zinc-200"
                >
                    <option value="dateAdded">Date d&apos;ajout</option>
                    <option value="progress">Progression</option>
                    <option value="releaseDate">Date de sortie</option>
                </select>
            </div>
        </div>
      </div>

      {/* Grid */}
      {sortedLibrary.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
              Aucun jeu trouvé.
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedLibrary.map((item) => (
              <GameCard key={item.id} item={item} paceFactor={userPaceFactor} />
            ))}
          </div>
      )}

      <ManualAddModal isOpen={isManualAddOpen} onClose={() => setIsManualAddOpen(false)} />
    </div>
  );
}
