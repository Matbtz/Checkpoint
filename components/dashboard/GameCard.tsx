'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor, Check } from 'lucide-react';
import { useImageColor } from '@/hooks/use-image-color';

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
  primaryColor?: string;
  secondaryColor?: string;
}

export function GameCard({ item, paceFactor = 1.0, onClick, primaryColor, secondaryColor }: GameCardProps) {
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
    if (score >= 75) return 'border-green-500 text-green-500';
    if (score >= 50) return 'border-yellow-500 text-yellow-500';
    return 'border-red-500 text-red-500';
  };

  // Color Extraction
  const { colors: extractedColors } = useImageColor(game.coverImage || game.backgroundImage);

  // Use props if provided, otherwise fallback to extracted colors
  const activePrimaryColor = primaryColor || extractedColors?.primary;
  const activeSecondaryColor = secondaryColor || extractedColors?.secondary;
  const hasCustomColors = !!activePrimaryColor && !!activeSecondaryColor;

  return (
    <motion.div
        layoutId={game.id}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.3 }}
        className={cn(
            "group relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer shadow-lg hover:shadow-xl transition-all",
            !hasCustomColors && "border border-white/20 shadow-[0_0_15px_-3px_rgba(255,255,255,0.1)]",
            hasCustomColors && "border-2 border-transparent"
        )}
        style={hasCustomColors ? {
            backgroundImage: `linear-gradient(#18181b, #18181b), linear-gradient(to bottom right, ${activePrimaryColor}, ${activeSecondaryColor})`,
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
            boxShadow: `0 0 20px -5px ${activePrimaryColor}40`
        } : undefined}
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
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-l from-black/80 via-black/40 to-black/20 z-10" />
      </div>

      {/* Layer 2: Content Grid */}
      <div className="relative z-20 grid h-full grid-cols-[auto_1fr_auto] gap-6 p-6">

        {/* Column 1: Cover Art (Fixed Width) */}
        <div className="relative h-full aspect-[2/3] shrink-0 overflow-hidden rounded-xl shadow-2xl ring-1 ring-white/10 group-hover:brightness-110 transition-all duration-300">
             {game.coverImage || game.backgroundImage ? (
                <Image
                    src={game.coverImage || game.backgroundImage || ''}
                    alt={game.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 150px, 200px"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-800 p-2 text-center text-xs text-zinc-500">
                    No Image
                </div>
            )}

            {/* Platform Icon - Overlaid on Cover Art */}
            <div className="absolute bottom-1 right-1 flex items-center justify-center rounded bg-black/70 p-1.5 backdrop-blur-md border border-white/10">
                 {isSteam ? (
                     <Gamepad2 className="h-4 w-4 text-white/90" />
                 ) : (
                     <Monitor className="h-4 w-4 text-white/50" />
                 )}
            </div>
        </div>

        {/* Column 2: Main Content (Flexible) */}
        <div className="flex flex-col h-full min-w-0 justify-between py-1">
            <div className="flex flex-col gap-1">
                {/* Title */}
                <h2 className="text-3xl font-black uppercase leading-[0.9] text-white drop-shadow-lg line-clamp-2 tracking-tight">
                    {game.title}
                </h2>

                {/* Metadata: Year | Studio */}
                <div className="flex items-center gap-2 font-inter text-sm font-extralight tracking-tight text-zinc-200/90 mt-1">
                    <span>{releaseYear || 'N/A'}</span>
                    <span className="text-zinc-500 font-light">|</span>
                    <span className="truncate">{developer}</span>
                </div>

                {/* Genres */}
                {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {genres.slice(0, 3).map((genre: string) => (
                            <span key={genre} className="px-2 py-0.5 rounded-full bg-white/10 border border-white/5 text-[10px] uppercase font-bold tracking-wider text-zinc-300 backdrop-blur-sm">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Progress Section (Anchored to bottom) */}
            <div className="w-full group/progress relative mt-auto">
                {/* Tooltip */}
                <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-black/80 backdrop-blur-md rounded border border-white/10 text-[10px] font-medium text-white opacity-0 group-hover/progress:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                    Target: {targetType === '100%' ? 'Completionist' : targetType === 'Extra' ? 'Main + Extra' : 'Main Story'} ({totalHours ? `${totalHours}h` : 'N/A'})
                </div>

                {/* Bar Container */}
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

                    {/* Text Layer */}
                    <div className="absolute inset-0 flex items-center justify-between px-2 z-10">
                        <div className="flex items-center gap-1 text-[9px] font-bold text-white drop-shadow-md uppercase tracking-wider">
                            {isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
                            <span>{playedHours}h Played</span>
                        </div>
                        <div className="text-[9px] font-bold text-white/60 uppercase tracking-wider group-hover/progress:text-white/90 transition-colors">
                            {totalHours ? `/ ${totalHours}h` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Column 3: Score (Fixed Width) */}
        <div className="flex flex-col items-center justify-center h-full gap-2 min-w-[80px]">
            {scores.metacritic ? (
                <>
                    <div className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-full border-[3px] bg-black/50 backdrop-blur-md shadow-lg",
                        getScoreColor(scores.metacritic)
                    )}>
                        <span className={cn(
                            "text-xl font-black font-mono tracking-tighter",
                            getScoreColor(scores.metacritic).split(' ')[1] // Extract text color class
                        )}>
                            {scores.metacritic}
                        </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                        Metacritic
                    </span>
                </>
            ) : (
                 <div className="flex flex-col items-center justify-center opacity-30">
                    <div className="h-12 w-12 rounded-full border-2 border-zinc-500 bg-transparent" />
                    <span className="mt-1 text-[9px] uppercase tracking-wider text-zinc-500">N/A</span>
                </div>
            )}
        </div>

      </div>
    </motion.div>
  );
}
