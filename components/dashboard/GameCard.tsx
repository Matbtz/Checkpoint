'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor, Check } from 'lucide-react';
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

  // Logic: Extract Genres
  const genres = useMemo(() => {
    try {
        return game.genres ? JSON.parse(game.genres as string) : [];
    } catch {
        return [];
    }
  }, [game.genres]);

  // Logic: Extract Scores
  const scores = useMemo(() => {
      try {
          const parsed = game.scores ? JSON.parse(game.scores as string) : {};
          if (game.metacritic) parsed.metacritic = game.metacritic;
          return parsed;
      } catch {
          return { metacritic: game.metacritic };
      }
  }, [game.scores, game.metacritic]);

  // Logic: Progress & Time
  const playedMinutes = item.playtimeManual ?? item.playtimeSteam ?? 0;
  const targetType = item.targetedCompletionType || 'Main';

  const adjustedHltbTimes = useMemo(() => {
      const times: any = {};
      try {
          const parsed = game.hltbTimes ? JSON.parse(game.hltbTimes as string) : {};
          times.main = game.hltbMain ?? parsed.main;
          times.extra = game.hltbExtra ?? parsed.extra;
          times.completionist = game.hltbCompletionist ?? parsed.completionist;
      } catch {
          times.main = game.hltbMain;
          times.extra = game.hltbExtra;
          times.completionist = game.hltbCompletionist;
      }
      
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

  // UI Helper: Score Colors
  const getScoreColor = (score: number) => {
    if (score >= 75) return 'border-green-500 text-green-500';
    if (score >= 50) return 'border-yellow-500 text-yellow-500';
    return 'border-red-500 text-red-500';
  };

  // Color Extraction for Borders
  const { colors: extractedColors } = useImageColor(game.coverImage || game.backgroundImage);
  const activePrimaryColor = primaryColor || extractedColors?.primary;
  const activeSecondaryColor = secondaryColor || extractedColors?.secondary;
  const hasCustomColors = !!activePrimaryColor && !!activeSecondaryColor;

  return (
    <motion.div
        layoutId={game.id}
        whileHover={{ scale: 1.005 }}
        className={cn(
            "group relative w-full min-h-[140px] overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer transition-all",
            !hasCustomColors ? "border border-white/10" : "border-2 border-transparent"
        )}
        style={hasCustomColors ? {
            backgroundImage: `linear-gradient(#18181b, #18181b), linear-gradient(to bottom right, ${activePrimaryColor}, ${activeSecondaryColor})`,
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
            boxShadow: `0 8px 24px -12px ${activePrimaryColor}60`
        } : undefined}
        onClick={onClick}
    >
      {/* Background Layer */}
      <div className="absolute inset-0 z-0 select-none">
        <Image
          src={game.backgroundImage || game.coverImage || ''}
          alt=""
          fill
          className="object-cover opacity-30 blur-[6px]"
          priority={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/90 to-transparent z-10" />
      </div>

      {/* Content Grid: 3-column layout */}
      <div className="relative z-20 grid h-full grid-cols-[70px_1fr_54px] sm:grid-cols-[90px_1fr_64px] gap-3 p-3 sm:p-4">

        {/* Column 1: Poster Art */}
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/10">
             <Image
                src={game.coverImage || game.backgroundImage || ''}
                alt={game.title}
                fill
                className="object-cover"
                sizes="90px"
            />
            <div className="absolute bottom-1 right-1 rounded bg-black/80 p-0.5 backdrop-blur-md border border-white/10">
                 {isSteam ? <Gamepad2 className="h-2.5 w-2.5 text-white" /> : <Monitor className="h-2.5 w-2.5 text-white/50" />}
            </div>
        </div>

        {/* Column 2: Info & Progress (Max space) */}
        <div className="flex flex-col justify-between min-w-0 py-0.5">
            <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl font-black uppercase leading-[1.1] text-white line-clamp-2 tracking-tighter">
                    {game.title}
                </h2>

                <div className="flex items-center gap-1.5 font-inter text-[10px] sm:text-xs font-extralight text-zinc-400 mt-1">
                    <span className="shrink-0">{releaseYear || 'N/A'}</span>
                    <span className="text-zinc-600">|</span>
                    <span className="truncate">{developer}</span>
                </div>

                {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {genres.slice(0, 2).map((genre: string) => (
                            <span key={genre} className="px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] uppercase font-bold text-zinc-500">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className="w-full mt-3 pr-2">
                <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                        className={cn("absolute inset-y-0 left-0", isCompleted ? "bg-yellow-500" : "bg-cyan-500")}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-between px-1.5 z-10">
                        <span className="text-[7px] font-bold text-white uppercase drop-shadow-md">{playedHours}h Played</span>
                        <span className="text-[7px] font-bold text-white/80 drop-shadow-md">{totalHours ? `/ ${totalHours}h` : ''}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Column 3: Metacritic Score */}
        <div className="flex flex-col items-center justify-center h-full pt-1">
            {scores.metacritic ? (
                <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                        "flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full border-2 bg-black/40 backdrop-blur-sm",
                        getScoreColor(scores.metacritic)
                    )}>
                        <span className="text-xs sm:text-base font-black font-mono">
                            {scores.metacritic}
                        </span>
                    </div>
                    <span className="text-[7px] font-bold uppercase tracking-tight text-zinc-500">Score</span>
                </div>
            ) : (
                 <div className="opacity-20 flex flex-col items-center">
                    <div className="h-9 w-9 rounded-full border border-dashed border-zinc-500" />
                </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}

