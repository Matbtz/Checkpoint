'use client';

import { useState, useEffect } from 'react';
import { type UserLibrary, type Game, type Tag } from '@prisma/client';
import { GameCard } from './GameCard';
import { FilterStrip } from './FilterStrip';
import { calculateProgress } from '@/lib/format-utils';
import { AddGameModal } from './AddGameModal';
import { EditGameModal } from './EditGameModal';
import { Button } from '@/components/ui/button';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AnimatePresence, motion } from 'framer-motion';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface DashboardProps {
  initialLibrary: GameWithLibrary[];
  userPaceFactor?: number;
}

type SortOption = 'dateAdded' | 'progress' | 'releaseDate';
type StatusFilter = 'All' | 'Playing' | 'Backlog' | 'Completed' | 'Wishlist' | 'Abandoned';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'All', label: 'All Games' },
    { id: 'Playing', label: 'Playing' },
    { id: 'Backlog', label: 'Backlog' },
    { id: 'Completed', label: 'Completed' },
    { id: 'Wishlist', label: 'Wishlist' },
    { id: 'Abandoned', label: 'Abandoned' },
];

export function Dashboard({ initialLibrary, userPaceFactor = 1.0 }: DashboardProps) {
  const [library, setLibrary] = useState<GameWithLibrary[]>(initialLibrary);

  useEffect(() => {
    setLibrary(initialLibrary);
  }, [initialLibrary]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('dateAdded');

  // Modal states
  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameWithLibrary | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Filter Logic
  const filteredLibrary = library.filter(item => {
    // Status
    if (statusFilter !== 'All' && item.status !== statusFilter) return false;

    // Search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!item.game.title.toLowerCase().includes(query)) return false;
    }

    return true;
  });

  // Sort Logic
  const sortedLibrary = [...filteredLibrary].sort((a, b) => {
    switch (sortBy) {
      case 'dateAdded':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'progress':
        const progressA = calculateProgress(a.playtimeManual ?? a.playtimeSteam ?? 0, a.game.hltbTimes, a.targetedCompletionType || 'Main');
        const progressB = calculateProgress(b.playtimeManual ?? b.playtimeSteam ?? 0, b.game.hltbTimes, b.targetedCompletionType || 'Main');
        return progressB - progressA;
      case 'releaseDate':
        const dateA = a.game.releaseDate ? new Date(a.game.releaseDate).getTime() : 0;
        const dateB = b.game.releaseDate ? new Date(b.game.releaseDate).getTime() : 0;
        return dateB - dateA;
      default:
        return 0;
    }
  });

  const handleGameClick = (item: GameWithLibrary) => {
      setSelectedGame(item);
      setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your library..."
                className="pl-9 bg-muted/50 border-muted-foreground/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-full md:w-auto"
              >
                  <option value="dateAdded">Recently Added</option>
                  <option value="progress">Progress</option>
                  <option value="releaseDate">Release Date</option>
              </select>

              <Button onClick={() => setIsAddGameOpen(true)} className="whitespace-nowrap">
                  <Plus className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Add Game</span>
              </Button>
          </div>
      </div>

      {/* Horizontal Filter Strip */}
      <FilterStrip
        filters={STATUS_FILTERS}
        activeFilter={statusFilter}
        onFilterChange={(id) => setStatusFilter(id as StatusFilter)}
      />

      {/* Grid/List Layout */}
      <motion.div
        layout
        className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        <AnimatePresence mode="popLayout">
            {sortedLibrary.length === 0 ? (
                <motion.div
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="col-span-full py-12 text-center text-muted-foreground"
                >
                    <p className="text-lg">No games found in {statusFilter === 'All' ? 'your library' : statusFilter}.</p>
                    {statusFilter === 'All' && (
                        <Button variant="link" onClick={() => setIsAddGameOpen(true)} className="mt-2">
                            Add your first game
                        </Button>
                    )}
                </motion.div>
            ) : (
                sortedLibrary.map((item) => (
                    <GameCard
                        key={item.id}
                        item={item}
                        paceFactor={userPaceFactor}
                        onClick={() => handleGameClick(item)}
                    />
                ))
            )}
        </AnimatePresence>
      </motion.div>

      {/* Modals */}
      <AddGameModal isOpen={isAddGameOpen} onClose={() => setIsAddGameOpen(false)} />

      {selectedGame && (
          <EditGameModal
            item={selectedGame}
            isOpen={isEditModalOpen}
            onClose={() => {
                setIsEditModalOpen(false);
                setSelectedGame(null);
            }}
          />
      )}
    </div>
  );
}
