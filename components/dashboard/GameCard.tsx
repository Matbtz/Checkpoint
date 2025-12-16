'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor } from 'lucide-react';

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
  item: GameWithLibrary;
  paceFactor?: number;
  onClick?: () => void;
}

export function GameCard({ item, paceFactor = 1.0, onClick }: GameCardProps) {
  const { game } = item;

  // --- Data Preparation Logic (Preserved) ---

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
          if (game.genres.startsWith('[')) {
              return JSON.parse(game.genres);
          }
          return game.genres.split(',').map(g => g.trim());
      } catch {
          return [];
      }
  }, [game.genres]);

  // Progress Calculations
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

  // Format times for display (Hours)
  const playedHours = Math.round(playedMinutes / 60);

  const timeToBeat = adjustedHltbTimes[targetType.toLowerCase() === '100%' ? 'completionist' : targetType.toLowerCase() === 'extra' ? 'extra' : 'main'];
  const totalHours = timeToBeat ? Math.round(timeToBeat) : null;

  const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
  const isSteam = (item.playtimeSteam && item.playtimeSteam > 0) || false;

  return (
    <motion.div
        layoutId={game.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.3 }}
        className="group relative h-[280px] w-full overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer shadow-lg hover:shadow-xl transition-all"
        onClick={onClick}
    >
      {/* Layer 1: Background Art */}
      <div className="absolute inset-0 z-0 select-none">
        {game.backgroundImage || game.coverImage ? (
          <Image
            src={game.backgroundImage || game.coverImage || ''}
            alt=""
            fill
            className="object-cover opacity-80 blur-sm transition-transform duration-700 group-hover:scale-105"
            priority={false}
          />
        ) : (
             <div className="absolute inset-0 bg-zinc-800" />
        )}
        {/* Dark Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent z-10" />
      </div>

      {/* Layer 2: Content Grid */}
      <div className="relative z-20 grid h-full grid-cols-[140px_1fr] gap-5 p-5 sm:grid-cols-[150px_1fr]">

        {/* Left Column: Cover & Platform */}
        <div className="flex flex-col gap-3">
            {/* Floating Portrait Cover */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 group-hover:brightness-110 transition-all duration-300">
                {game.coverImage || game.backgroundImage ? (
                    <Image
                        src={game.coverImage || game.backgroundImage || ''}
                        alt={game.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 140px, 150px"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 p-2 text-center text-xs text-zinc-500">
                        No Image
                    </div>
                )}
            </div>

            {/* Platform Icon */}
            <div className="flex items-center justify-center gap-2 text-white/60">
                 {isSteam ? (
                    <>
                        <Gamepad2 className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Steam</span>
                    </>
                 ) : (
                    <>
                        <Monitor className="h-4 w-4 opacity-50" />
                        <span className="text-xs font-medium uppercase tracking-wide opacity-50">PC</span>
                    </>
                 )}
            </div>
        </div>

        {/* Right Column: Details & Progress */}
        <div className="flex flex-col h-full min-w-0">

            {/* Header */}
            <div className="mb-4">
                <h2 className="mb-1 text-3xl font-bold leading-none tracking-tight text-white/95 line-clamp-2 drop-shadow-sm">
                    {game.title}
                </h2>
                {releaseYear && (
                    <p className="text-sm font-medium uppercase tracking-wider text-white/70">
                        Released {releaseYear}
                    </p>
                )}
            </div>

            {/* Badges (Glassmorphism) */}
            <div className="flex flex-wrap gap-2 mb-4">
                {genres.slice(0, 3).map((genre: string) => (
                    <div
                        key={genre}
                        className="rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-xs font-semibold text-white/90 shadow-sm border border-white/5 whitespace-nowrap"
                    >
                        {genre}
                    </div>
                ))}
            </div>

            {/* Bottom Section (Anchored) */}
            <div className="mt-auto">

                {/* Scores */}
                <div className="flex gap-3 mb-5">
                    {scores.metacritic && (
                        <div className="flex items-center gap-1.5 rounded bg-black/40 px-2 py-1 backdrop-blur-sm border border-white/5">
                            <div className={cn(
                                "h-2 w-2 rounded-full",
                                scores.metacritic >= 75 ? "bg-green-500" :
                                scores.metacritic >= 50 ? "bg-yellow-500" : "bg-red-500"
                            )} />
                            <span className="text-xs font-bold text-white/90 font-mono">
                                {scores.metacritic}
                            </span>
                        </div>
                    )}
                    {scores.openCritic && (
                         <div className="flex items-center gap-1.5 rounded bg-black/40 px-2 py-1 backdrop-blur-sm border border-white/5">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            <span className="text-xs font-bold text-white/90 font-mono">
                                {Math.round(scores.openCritic)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Progress Section */}
                <div className="w-full">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-medium font-mono text-white/90">
                            Played: <span className="text-cyan-400">{playedHours}h</span>
                        </span>
                        <span className="text-sm font-medium font-mono text-white/60">
                           {totalHours ? `Total: ${totalHours}h` : 'No Estimate'}
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <motion.div
                            className="absolute inset-y-0 left-0 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        />
                    </div>
                </div>
            </div>

        </div>
      </div>
    </motion.div>
  );
}
