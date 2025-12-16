'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
  item: GameWithLibrary;
  paceFactor?: number;
  onClick?: () => void;
}

export function GameCard({ item, paceFactor = 1.0, onClick }: GameCardProps) {
  const { game } = item;

  // HLTB Times
  const hltbTimes = useMemo(() => {
    try {
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
  }, [game]);

  // Scores
  const scores = useMemo(() => {
      try {
          return game.scores ? JSON.parse(game.scores) : {};
      } catch {
          return {};
      }
  }, [game.scores]);

  // Genres
  const genres = useMemo(() => {
      try {
          if (!game.genres) return [];
          // Handle both JSON array string and comma-separated string
          if (game.genres.startsWith('[')) {
              return JSON.parse(game.genres);
          }
          return game.genres.split(',').map(g => g.trim());
      } catch {
          return [];
      }
  }, [game.genres]);

  // Progress
  const playedMinutes = item.playtimeManual ?? item.playtimeSteam ?? 0;
  const targetType = item.targetedCompletionType || 'Main';

  const adjustedHltbTimes = useMemo(() => {
      const times = { ...hltbTimes };
      if (times.main) times.main = times.main * paceFactor;
      if (times.extra) times.extra = times.extra * paceFactor;
      if (times.completionist) times.completionist = times.completionist * paceFactor;
      return times;
  }, [hltbTimes, paceFactor]);

  const calculatedProgress = calculateProgress(playedMinutes, adjustedHltbTimes, targetType);
  const progress = item.progressManual ?? calculatedProgress;
  const showProgress = (item.playtimeManual !== null || item.playtimeSteam !== null) || item.progressManual !== null;

  // Time formatting (Hours)
  const playedHours = Math.round(playedMinutes / 60);

  const timeToBeat = adjustedHltbTimes[targetType.toLowerCase() === '100%' ? 'completionist' : targetType.toLowerCase() === 'extra' ? 'extra' : 'main'];
  const totalHours = timeToBeat ? Math.round(timeToBeat) : null;

  const formattedTimeOverlay = showProgress
      ? `${playedHours}h ${totalHours ? `/ ${totalHours}h` : ''}`
      : totalHours ? `${totalHours}h` : '';

  const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

  return (
    <motion.div
        layoutId={game.id}
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
        className="group relative flex flex-row bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-border/40 h-32 cursor-pointer"
        onClick={onClick}
    >
      {/* Image Container - Fixed Width, Portrait Aspect Ratio */}
      <div className="relative w-24 h-full flex-shrink-0 bg-muted">
        {game.coverImage || game.backgroundImage ? (
          <Image
            src={game.coverImage || game.backgroundImage || ''}
            alt={game.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-2 text-center">
            <span className="text-white font-bold text-xs line-clamp-3">{game.title}</span>
          </div>
        )}
      </div>

      {/* Content Container */}
      <div className="flex flex-col flex-1 min-w-0 justify-between p-3">

        {/* Header */}
        <div>
            <div className="flex justify-between items-start gap-2">
                <h3 className="font-bold text-base leading-tight line-clamp-1 text-foreground">
                    {game.title}
                </h3>
                {releaseYear && (
                    <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                        {releaseYear}
                    </span>
                )}
            </div>

            {/* Metadata Row */}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {/* Simplified Platform Icons (Mock logic as actual platforms aren't in DB game model explicitly usually) */}
                {/* We can infer from data or just show genre badges primarily as requested */}

                {genres.slice(0, 2).map((genre: string) => (
                    <Badge key={genre} variant="secondary" className="text-[10px] px-1.5 h-5 font-normal bg-secondary/50 text-secondary-foreground/80">
                        {genre}
                    </Badge>
                ))}
            </div>
        </div>

        {/* Footer Info */}
        <div className="flex flex-col gap-2 mt-auto">
            {/* Scores Row */}
            <div className="flex items-center gap-2">
                 {scores.metacritic && (
                    <div className={`text-[10px] px-1.5 rounded font-bold ${
                        scores.metacritic >= 75 ? 'bg-green-500/10 text-green-500' :
                        scores.metacritic >= 50 ? 'bg-yellow-500/10 text-yellow-500' :
                        'bg-red-500/10 text-red-500'
                    }`}>
                        MC {scores.metacritic}
                    </div>
                 )}
                 {scores.openCritic && (
                     <div className="text-[10px] px-1.5 rounded font-bold bg-blue-500/10 text-blue-500">
                         OC {Math.round(scores.openCritic)}
                     </div>
                 )}
            </div>

             {/* Progress Bar with Overlay */}
            <div className="relative h-4 w-full bg-muted/50 rounded-full overflow-hidden">
                {/* Progress Fill */}
                {showProgress && (
                     <div
                        className="h-full bg-primary/80 transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                )}

                {/* Text Overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-medium text-foreground/80 drop-shadow-sm">
                        {formattedTimeOverlay || (showProgress ? "0h" : "Not Started")}
                    </span>
                </div>
            </div>
        </div>
      </div>
    </motion.div>
  );
}
