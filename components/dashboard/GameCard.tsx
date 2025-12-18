'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor } from 'lucide-react';
import { useImageColor } from '@/hooks/use-image-color';

type ExtendedGame = Game & {
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

  const genres = useMemo(() => {
    try {
        return game.genres ? JSON.parse(game.genres) : [];
    } catch {
        return [];
    }
  }, [game.genres]);

  const scores = useMemo(() => {
      try {
          const parsed = game.scores ? JSON.parse(game.scores) : {};
          if (game.metacritic) parsed.metacritic = game.metacritic;
          return parsed;
      } catch {
          return { metacritic: game.metacritic };
      }
  }, [game.scores, game.metacritic]);

  const playedMinutes = item.playtimeManual ?? item.playtimeSteam ?? 0;
  const targetType = item.targetedCompletionType || 'Main';

  const adjustedHltbTimes = useMemo(() => {
      const times = game.hltbTimes ? JSON.parse(game.hltbTimes as string) : {};
      if (game.hltbMain) times.main = game.hltbMain;
      if (game.hltbExtra) times.extra = game.hltbExtra;
      if (game.hltbCompletionist) times.completionist = game.hltbCompletionist;

      if (times.main) times.main *= paceFactor;
      if (times.extra) times.extra *= paceFactor;
      if (times.completionist) times.completionist *= paceFactor;
      return times;
  }, [game, paceFactor]);

  const progress = item.progressManual ?? calculateProgress(playedMinutes, adjustedHltbTimes, targetType);
  const playedHours = Math.round(playedMinutes / 60);
  const timeToBeat = adjustedHltbTimes[targetType.toLowerCase() === '100%' ? 'completionist' : targetType.toLowerCase() === 'extra' ? 'extra' : 'main'];
  const totalHours = timeToBeat ? Math.round(timeToBeat) : null;
  const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
  const developer = extendedGame.studio || "Unknown Studio";
  const isSteam = (item.playtimeSteam && item.playtimeSteam > 0) || false;
  const isCompleted = progress >= 100;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'border-green-500 text-green-500';
    if (score >= 50) return 'border-yellow-500 text-yellow-500';
    return 'border-red-500 text-red-500';
  };

  const { colors: extractedColors } = useImageColor(game.coverImage || game.backgroundImage);
  const activePrimaryColor = primaryColor || extractedColors?.primary;
  const activeSecondaryColor = secondaryColor || extractedColors?.secondary;
  const hasCustomColors = !!activePrimaryColor && !!activeSecondaryColor;

  return (
    <motion.div
        layoutId={game.id}
        whileHover={{ scale: 1.01 }}
        className={cn(
            "group relative w-full min-h-[150px] overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer shadow-lg transition-all mb-4",
            !hasCustomColors ? "border border-white/10" : "border-2 border-transparent"
        )}
        style={hasCustomColors ? {
            backgroundImage: `linear-gradient(#18181b, #18181b), linear-gradient(to bottom right, ${activePrimaryColor}, ${activeSecondaryColor})`,
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
        } : undefined}
        animate={hasCustomColors ? {
            boxShadow: [
                `0 0 15px -5px ${activePrimaryColor}40`,
                `0 0 30px -5px ${activePrimaryColor}60`,
                `0 0 15px -5px ${activePrimaryColor}40`
            ]
        } : undefined}
        transition={{
            boxShadow: {
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
            }
        }}
        onClick={onClick}
    >
      {/* Layer 1: Background Art */}
      <div className="absolute inset-0 z-0 select-none">
        <Image
          src={game.backgroundImage || game.coverImage || ''}
          alt=""
          fill
          className="object-cover opacity-50"
          priority={false}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,transparent_30%,#09090b_50%,transparent_70%,transparent_100%)] z-10" />
      </div>

      {/* Layer 2: Content Grid */}
      <div className="relative z-20 grid h-full grid-cols-[100px_1fr] sm:grid-cols-[120px_1fr] gap-4 p-3">

        {/* Column 1: Cover Art */}
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/10">
             <Image
                src={game.coverImage || game.backgroundImage || ''}
                alt={game.title}
                fill
                className="object-cover"
                sizes="100px"
            />
            <div className="absolute bottom-1 right-1 rounded bg-black/80 p-1 backdrop-blur-md border border-white/10">
                 {isSteam ? <Gamepad2 className="h-3 w-3 text-white" /> : <Monitor className="h-3 w-3 text-white/50" />}
            </div>
        </div>

        {/* Column 2: Main Content */}
        <div className="flex flex-col justify-between min-w-0 py-0.5">
            <div>
                <h2 className="text-lg sm:text-xl font-black uppercase leading-tight text-white line-clamp-2 tracking-tight z-30 relative">
                    {game.title}
                </h2>

                <div className="flex items-center gap-2 font-inter text-xs font-extralight text-zinc-400 mt-1">
                    <span>{releaseYear || 'N/A'}</span>
                    <span>|</span>
                    <span className="truncate">{developer}</span>
                </div>

                {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {genres.slice(0, 2).map((genre: string) => (
                            <span key={genre} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] uppercase font-bold text-zinc-400">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Progress Section */}
            <div className="w-full mt-3">
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                        className={cn("absolute inset-y-0 left-0", isCompleted ? "bg-yellow-500" : "bg-cyan-500")}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-2 z-10 mix-blend-difference">
                        <span className="text-[8px] font-bold text-white uppercase">{playedHours}h Played</span>
                        <span className="text-[8px] font-bold text-white/80">{totalHours ? `/ ${totalHours}h` : ''}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Layer 3: Score Overlay */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-30 pointer-events-none">
            {scores.metacritic ? (
                <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                        "flex h-9 w-9 sm:h-12 sm:w-12 items-center justify-center rounded-full border-2 bg-black/40 backdrop-blur-sm",
                        getScoreColor(scores.metacritic)
                    )}>
                        <span className="text-sm sm:text-lg font-black font-mono">
                            {scores.metacritic}
                        </span>
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-tighter text-zinc-500">Score</span>
                </div>
            ) : (
                 <div className="opacity-20 flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full border border-dashed border-zinc-500" />
                    <span className="text-[8px] mt-1 text-zinc-500">N/A</span>
                </div>
            )}
      </div>
    </motion.div>
  );
}
