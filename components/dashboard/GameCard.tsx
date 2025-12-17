'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor, Check } from 'lucide-react';

// Extend the Game type to include the 'studio' field
type ExtendedGame = Game & {
  // studio is now in the schema, but keeping this for safety if client types aren't fully regenerated
  studio?: string | null;
};

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
  item: GameWithLibrary;
  paceFactor?: number;
  onClick?: () => void;
}

export function GameCard({ item, paceFactor = 1.0, onClick }: GameCardProps) {
  const { game } = item;
  const extendedGame = game as ExtendedGame;

  // Genres
  const genres = useMemo(() => {
    try {
        return game.genres ? JSON.parse(game.genres) : [];
    } catch {
        return [];
    }
  }, [game.genres]);

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

  // Scores - Fallback to JSON or direct fields
  const scores = useMemo(() => {
      try {
          const parsed = game.scores ? JSON.parse(game.scores) : {};
          // Prefer direct field if available
          if (game.metacritic) {
              parsed.metacritic = game.metacritic;
          }
          return parsed;
      } catch {
          return { metacritic: game.metacritic };
      }
  }, [game.scores, game.metacritic]);

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
  // Safely access studio/developer with fallback
  const developer = extendedGame.studio || "Unknown Studio";

  const isSteam = (item.playtimeSteam && item.playtimeSteam > 0) || false;
  const isCompleted = progress >= 100;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'border-green-500';
    if (score >= 50) return 'border-yellow-500';
    return 'border-red-500';
  };

  return (
    <motion.div
        layoutId={game.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.3 }}
        className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer shadow-lg hover:shadow-xl transition-all border border-white/20 shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]"
        onClick={onClick}
    >
      {/* Layer 1: Background Art */}
      <div className="absolute inset-0 z-0 select-none">
        {game.backgroundImage || game.coverImage ? (
          <Image
            src={game.backgroundImage || game.coverImage || ''}
            alt=""
            fill
            className="object-cover opacity-80 blur-[2px] transition-transform duration-700 group-hover:scale-105"
            priority={false}
          />
        ) : (
             <div className="absolute inset-0 bg-zinc-800" />
        )}
      </div>

      {/* Layer 2: Content Flex */}
      <div className="relative z-20 flex h-full gap-4 p-4">

        {/* Left Column: Cover & Platform */}
        <div className="relative h-full aspect-[2/3] shrink-0 overflow-hidden rounded-xl shadow-lg ring-1 ring-white/10 group-hover:brightness-110 transition-all duration-300">
             {game.coverImage || game.backgroundImage ? (
                <Image
                    src={game.coverImage || game.backgroundImage || ''}
                    alt={game.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 112px, 112px"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-800 p-2 text-center text-xs text-zinc-500">
                    No Image
                </div>
            )}

            {/* Platform Icon - Absolute Bottom Right */}
            <div className="absolute bottom-1 right-1 flex items-center justify-center rounded bg-black/60 p-1 backdrop-blur-sm">
                 {isSteam ? (
                     <Gamepad2 className="h-3 w-3 text-white/90" />
                 ) : (
                     <Monitor className="h-3 w-3 text-white/50" />
                 )}
            </div>
        </div>

        {/* Right Column: Details & Progress */}
        <div className="flex flex-col h-full min-w-0 flex-grow">

            {/* Header: Title & Scores */}
            <div className="flex justify-between items-start mb-1 gap-2">
                <h2 className="text-lg font-bold leading-tight text-white/95 line-clamp-1 drop-shadow-sm flex-grow">
                    {game.title}
                </h2>

                {/* Circular Scores */}
                <div className="flex gap-2 shrink-0">
                    {scores.metacritic && (
                         <div className={cn(
                             "flex h-8 w-8 items-center justify-center rounded-full border-2 bg-black/40 backdrop-blur-sm",
                             getScoreColor(scores.metacritic)
                         )}>
                            <span className="text-[10px] font-bold text-white font-mono">
                                {scores.metacritic}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Metadata Row: Year | Developer */}
            <div className="flex items-center gap-1.5 mt-1 select-none font-inter">
                <span className="text-[11px] font-extralight text-zinc-300 tracking-wider">
                    {releaseYear || 'N/A'}
                </span>

                <span className="text-[10px] text-zinc-500 font-light">•</span>

                <span className="text-[11px] font-extralight text-zinc-300 tracking-wider truncate max-w-[120px]">
                    {developer}
                </span>
            </div>

            {/* Genres Row */}
            {genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                    {genres.slice(0, 3).map((genre: string) => (
                        <span key={genre} className="px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/10 text-[9px] text-zinc-400">
                            {genre}
                        </span>
                    ))}
                    {genres.length > 3 && (
                        <span className="px-1.5 py-0.5 text-[9px] text-zinc-500">
                            +{genres.length - 3}
                        </span>
                    )}
                </div>
            )}

            {/* Bottom Section (Anchored) */}
            <div className="mt-auto">

                {/* Progress Section */}
                <div className="w-full group/progress relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 backdrop-blur-md rounded border border-white/10 text-[10px] font-medium text-white opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                        Target: {targetType === '100%' ? 'Completionist' : targetType === 'Extra' ? 'Main + Extra' : 'Main Story'} ({totalHours ? `${totalHours}h` : 'N/A'})
                    </div>

                    {/* Bar Container - Sleek */}
                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/5 backdrop-blur-sm">

                        {/* Fill */}
                        <motion.div
                            className={cn(
                                "absolute inset-y-0 left-0 flex items-center justify-end px-2",
                                isCompleted
                                    ? "bg-gradient-to-r from-yellow-500 to-amber-500/90"
                                    : "bg-gradient-to-r from-cyan-500 to-blue-500/90"
                            )}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                        >
                            {/* Inner Glow Helper */}
                            <div className="absolute inset-0 bg-white/10" />
                        </motion.div>

                        {/* Text Layer (Overlay) */}
                        <div className="absolute inset-0 flex items-center justify-between px-2 z-10">
                            {/* Left: Played */}
                            <div className="flex items-center gap-1 text-[9px] font-bold text-white drop-shadow-md">
                                {isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                                <span>{playedHours}h</span>
                            </div>

                            {/* Right: Target */}
                            <div className="text-[9px] font-bold text-white/60 uppercase tracking-wider group-hover/progress:text-white/90 transition-colors">
                                {totalHours ? `/ ${totalHours}h` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
      </div>
    </motion.div>
  );
}
