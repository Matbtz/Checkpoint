'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { formatReleaseDate, getCountdownString, isReleasingSoon, calculateProgress } from '@/lib/format-utils';
import { cn } from '@/lib/utils';
import { EditGameModal } from './EditGameModal';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateManualPlayTime } from '@/actions/library';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
  item: GameWithLibrary;
}

export function GameCard({ item }: GameCardProps) {
  const { game } = item;
  const [countdown, setCountdown] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Quick Update State
  const [quickAddTime, setQuickAddTime] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Parse JSON fields safely
  const genres = useMemo(() => {
    try {
        return game.genres ? JSON.parse(game.genres) : [];
    } catch {
        return [];
    }
  }, [game.genres]);

  const scores = useMemo(() => {
    try {
        return game.scores ? JSON.parse(game.scores) : {};
    } catch {
        return {};
    }
  }, [game.scores]);

  const hltbTimes = useMemo(() => {
    try {
        return game.hltbTimes ? JSON.parse(game.hltbTimes) : {};
    } catch {
        return {};
    }
  }, [game.hltbTimes]);

  // Date Logic
  const releaseDate = useMemo(() => game.releaseDate ? new Date(game.releaseDate) : null, [game.releaseDate]);
  const isSoon = useMemo(() => releaseDate ? isReleasingSoon(releaseDate) : false, [releaseDate]);

  useEffect(() => {
    if (isSoon && releaseDate) {
      const updateCountdown = () => {
        setCountdown(getCountdownString(releaseDate));
      };
      updateCountdown();
      const interval = setInterval(updateCountdown, 60000);
      return () => clearInterval(interval);
    }
  }, [isSoon, releaseDate]);

  // Progress Logic
  const playedMinutes = item.playTimeManual ?? item.playTimeSteam ?? 0;
  const targetType = item.targetedCompletionType || 'Main';
  const progress = calculateProgress(playedMinutes, hltbTimes, targetType);

  const handleQuickAdd = async () => {
      if (!quickAddTime) return;
      const minutesToAdd = parseInt(quickAddTime);
      if (isNaN(minutesToAdd)) return;

      const current = item.playTimeManual ?? item.playTimeSteam ?? 0;
      await updateManualPlayTime(item.gameId, current + minutesToAdd);
      setIsPopoverOpen(false);
      setQuickAddTime('');
  };

  return (
    <>
    <div
        className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer relative group"
        onClick={() => setIsEditModalOpen(true)}
    >
      {/* Thumbnail Left */}
      <div className="relative w-32 h-auto flex-shrink-0 bg-zinc-100 dark:bg-zinc-800">
        {game.coverImage ? (
          <Image
            src={game.coverImage}
            alt={game.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-400 text-xs">No Image</div>
        )}
      </div>

      {/* Content Right */}
      <div className="flex flex-col flex-grow p-4 space-y-3">
        {/* Title and Genre */}
        <div>
          <h3 className="font-bold text-lg leading-tight text-zinc-900 dark:text-zinc-100 truncate">{game.title}</h3>
          <p className="text-xs text-zinc-500 truncate">
            {Array.isArray(genres) ? genres.slice(0, 3).join(', ') : 'Genre unknown'}
          </p>
        </div>

        {/* Indicators (Scores) */}
        <div className="flex gap-2">
            {scores.openCritic && (
                <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full border",
                    scores.openCritic >= 80 ? "bg-green-100 text-green-800 border-green-200" :
                    scores.openCritic >= 60 ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                    "bg-red-100 text-red-800 border-red-200"
                )}>
                    OC: {Math.round(scores.openCritic)}
                </span>
            )}
            {scores.rawg && (
                <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full border",
                    scores.rawg >= 80 ? "bg-blue-100 text-blue-800 border-blue-200" :
                    scores.rawg >= 60 ? "bg-orange-100 text-orange-800 border-orange-200" :
                    "bg-gray-100 text-gray-800 border-gray-200"
                )}>
                    RAWG: {Math.round(scores.rawg)}
                </span>
            )}
        </div>

        {/* Date or Progress */}
        <div className="mt-auto">
             {releaseDate && releaseDate > new Date() ? (
                // Future Release
                <div className="text-sm font-medium text-blue-600">
                    {isSoon ? countdown : `Sortie le ${formatReleaseDate(releaseDate)}`}
                </div>
             ) : (
                // Released - Show Progress Bar
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-zinc-500">
                        <span>Progression ({targetType})</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2.5 dark:bg-zinc-700">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
             )}
        </div>
      </div>

      {/* Quick Update Button for Playing games */}
      {item.status === 'Playing' && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                      <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full shadow-md">
                          <Plus className="h-4 w-4" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="end">
                        <div className="flex gap-1">
                            <Input
                                type="number"
                                placeholder="+ Min"
                                value={quickAddTime}
                                onChange={(e) => setQuickAddTime(e.target.value)}
                                className="h-8 text-xs"
                                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                            />
                            <Button size="sm" className="h-8 px-2" onClick={handleQuickAdd}>Ok</Button>
                        </div>
                  </PopoverContent>
              </Popover>
          </div>
      )}
    </div>

    <EditGameModal item={item} isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
    </>
  );
}
