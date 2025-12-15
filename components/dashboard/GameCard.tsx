'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { formatReleaseDate, getCountdownString, isReleasingSoon, calculateProgress } from '@/lib/format-utils';
import { cn } from '@/lib/utils';
import { EditGameModal } from './EditGameModal';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateManualPlayTime } from '@/actions/library';
import { enrichGameData } from '@/actions/enrich';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
  item: GameWithLibrary;
  paceFactor?: number;
}

export function GameCard({ item, paceFactor = 1.0 }: GameCardProps) {
  const { game } = item;
  const [countdown, setCountdown] = useState<string>('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Quick Update State
  const [quickAddTime, setQuickAddTime] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Parse JSON fields safely or handle string
  const genres = useMemo(() => {
    try {
        if (!game.genres) return [];
        // Try parsing as JSON first
        const parsed = JSON.parse(game.genres);
        if (Array.isArray(parsed)) return parsed;
        return []; // Should not happen if valid JSON array
    } catch {
        // If parsing fails, it might be a simple string (comma separated) as per new requirement
        if (typeof game.genres === 'string') {
            return game.genres.split(',').map(s => s.trim());
        }
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
        // Prefer explicit fields if available (added via enrichment)
        if (game.hltbMain !== null || game.hltbExtra !== null || game.hltbCompletionist !== null) {
            return {
                main: game.hltbMain,
                extra: game.hltbExtra,
                completionist: game.hltbCompletionist
            };
        }
        return game.hltbTimes ? JSON.parse(game.hltbTimes) : {};
    } catch {
        return {};
    }
  }, [game.hltbTimes, game.hltbMain, game.hltbExtra, game.hltbCompletionist]);

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
  const playedMinutes = item.playtimeManual !== null ? item.playtimeManual : item.playtimeSteam;
  const targetType = item.targetedCompletionType || 'Main';

  // Apply pace factor to HLTB times for display/calculation purposes
  const adjustedHltbTimes = useMemo(() => {
      const times = { ...hltbTimes };
      if (times.main) times.main = Math.round(times.main * paceFactor * 10) / 10; // keep 1 decimal
      if (times.extra) times.extra = Math.round(times.extra * paceFactor * 10) / 10;
      if (times.completionist) times.completionist = Math.round(times.completionist * paceFactor * 10) / 10;
      return times;
  }, [hltbTimes, paceFactor]);

  const progress = calculateProgress(playedMinutes, adjustedHltbTimes, targetType);

  // Determine if HLTB data is effectively missing for the selected target type
  const targetTime = adjustedHltbTimes[targetType.toLowerCase() === '100%' ? 'completionist' : targetType.toLowerCase() === 'extra' ? 'extra' : 'main'];
  const hasHltbData = targetTime > 0;

  const handleQuickAdd = async () => {
      if (!quickAddTime) return;
      const minutesToAdd = parseInt(quickAddTime);
      if (isNaN(minutesToAdd)) return;

      const current = item.playtimeManual ?? item.playtimeSteam ?? 0;
      await updateManualPlayTime(item.gameId, current + minutesToAdd);
      setIsPopoverOpen(false);
      setQuickAddTime('');
  };

  const handleSync = async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsSyncing(true);
      try {
          await enrichGameData(game.id, game.title);
      } catch (error) {
          console.error("Sync failed", error);
      } finally {
          setIsSyncing(false);
      }
  };

  const rawgScore = game.rawgRating || scores.rawg;
  const metacriticScore = game.metacritic || scores.metacritic;

  return (
    <>
    <div
        className="flex bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm hover:shadow-md cursor-pointer relative group hover:scale-105 transition-transform duration-200"
        onClick={() => setIsEditModalOpen(true)}
    >
      {/* Thumbnail Left */}
      <div className="relative w-32 h-auto flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center text-center p-2">
        {!imageError && (game.backgroundImage || game.coverImage) ? (
          <Image
            src={game.backgroundImage || game.coverImage || ''}
            alt={game.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
            onError={() => setImageError(true)}
          />
        ) : (
           <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-2">
                <span className="text-white text-xs font-bold line-clamp-3">{game.title}</span>
           </div>
        )}
      </div>

      {/* Content Right */}
      <div className="flex flex-col flex-grow p-4 space-y-3 relative">
        {/* Title and Genre */}
        <div>
           {/* Date Display (Top Right) */}
           {releaseDate && (
             <span className="absolute top-4 right-4 text-xs font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
               {formatReleaseDate(releaseDate)}
             </span>
           )}
          <h3 className="font-bold text-lg leading-tight text-zinc-900 dark:text-zinc-100 truncate pr-16">{game.title}</h3>
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
            {rawgScore && (
                <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full border",
                    rawgScore >= 4 ? "bg-blue-100 text-blue-800 border-blue-200" :
                    rawgScore >= 3 ? "bg-orange-100 text-orange-800 border-orange-200" :
                    "bg-gray-100 text-gray-800 border-gray-200"
                )}>
                    RAWG: {rawgScore}
                </span>
            )}
            {metacriticScore && (
                <span className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded-full border",
                    metacriticScore >= 80 ? "bg-green-100 text-green-800 border-green-200" :
                    metacriticScore >= 60 ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                    "bg-red-100 text-red-800 border-red-200"
                )}>
                    Meta: {metacriticScore}
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
                        <span>{hasHltbData ? `${Math.round(progress)}%` : 'N/A'}</span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-2.5 dark:bg-zinc-700 overflow-hidden">
                        {hasHltbData ? (
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            ></div>
                        ) : (
                            <div className="bg-zinc-300 dark:bg-zinc-600 h-2.5 w-full"></div>
                        )}
                    </div>
                </div>
             )}
        </div>
      </div>

      {/* Quick Update Button for Playing games */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full shadow-md"
            onClick={handleSync}
            disabled={isSyncing}
        >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
        </Button>
        {item.status === 'Playing' && (
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
        )}
      </div>
    </div>

    <EditGameModal item={item} isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
    </>
  );
}
