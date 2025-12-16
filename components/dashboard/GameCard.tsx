'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { Badge } from '@/components/ui/badge';
import { Clock, Trophy } from 'lucide-react';
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

  // HLTB Badge Text
  const timeToBeat = adjustedHltbTimes[targetType.toLowerCase() === '100%' ? 'completionist' : targetType.toLowerCase() === 'extra' ? 'extra' : 'main'];
  const formattedTime = timeToBeat ? `${Math.round(timeToBeat)}h` : 'N/A';

  return (
    <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        whileHover={{ y: -5 }}
        transition={{ duration: 0.2 }}
        className="group relative flex flex-col bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-border/50"
        onClick={onClick}
    >
      {/* Image Container - Strict Aspect Ratio 3:4 */}
      <div className="relative w-full aspect-[3/4] overflow-hidden bg-muted">
        {game.coverImage || game.backgroundImage ? (
          <Image
            src={game.coverImage || game.backgroundImage || ''}
            alt={game.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-110"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4 text-center">
            <span className="text-white font-bold text-lg line-clamp-3">{game.title}</span>
          </div>
        )}

        {/* Floating Badges */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
            {/* OpenCritic Score */}
            {scores.openCritic && (
                <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-md border-0 shadow-lg gap-1 px-2">
                    <Trophy className="w-3 h-3 text-yellow-400" />
                    {Math.round(scores.openCritic)}
                </Badge>
            )}
            {/* HLTB Time */}
            {timeToBeat && (
                <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-md border-0 shadow-lg gap-1 px-2">
                    <Clock className="w-3 h-3 text-blue-400" />
                    {formattedTime}
                </Badge>
            )}
        </div>

        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* Title Overlay */}
        <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-md">
                {game.title}
            </h3>
        </div>
      </div>

      {/* Progress Bar (Linear Gradient) */}
      {showProgress && (
          <div className="h-1.5 w-full bg-muted">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
          </div>
      )}

      {/* Hidden detail section that could expand or just be implicit */}
    </motion.div>
  );
}
