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
    if (score >= 75) return 'border-green-500 text-green-500 shadow-[0_0_15px_-3px_rgba(34,197,94,0.4)]';
    if (score >= 50) return 'border-yellow-500 text-yellow-500 shadow-[0_0_15px_-3px_rgba(234,179,8,0.4)]';
    return 'border-red-500 text-red-500';
  };

  const { colors: extractedColors } = useImageColor(game.coverImage || game.backgroundImage);
  const activePrimaryColor = primaryColor || extractedColors?.primary;
  const activeSecondaryColor = secondaryColor || extractedColors?.secondary;
  const hasCustomColors = !!activePrimaryColor && !!activeSecondaryColor;
  const glowColor = activePrimaryColor || '#ffffff';

  return (
    <motion.div
        layoutId={game.id}
        whileHover={{ scale: 1.02 }}
        initial={{ opacity: 0, y: 10 }}
        animate={
            hasCustomColors ? {
                opacity: 1,
                y: 0,
                boxShadow: [
                    `0 0 0px 0px ${glowColor}00`,
                    `0 0 30px -5px ${glowColor}50`,
                    `0 0 0px 0px ${glowColor}00`
                ]
            } : { opacity: 1, y: 0 }
        }
        transition={{
            boxShadow: {
                duration: 4,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
            },
            default: { duration: 0.3 }
        }}
        className={cn(
            "group relative w-full min-h-[150px] overflow-hidden rounded-2xl bg-zinc-950 cursor-pointer transition-all mb-4",
            !hasCustomColors && "border border-white/10 shadow-lg"
        )}
        style={hasCustomColors ? {
            backgroundImage: `linear-gradient(#09090b, #09090b), linear-gradient(to bottom right, ${activePrimaryColor}, ${activeSecondaryColor})`,
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
            border: '2px solid transparent',
        } : undefined}
        onClick={onClick}
    >
      {/* Layer 1: Background Art */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none">
        <Image
          src={game.backgroundImage || game.coverImage || ''}
          alt=""
          fill
          className="object-cover opacity-100"
          priority={false}
          style={{
            maskImage: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.7) 100%)'
          }}
        />
      </div>

      {/* Layer 2: Content Grid */}
      <div className="relative z-20 grid h-full grid-cols-[100px_1fr] gap-4 p-3.5">

        {/* Column 1: Cover Art */}
        <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 group-hover:scale-[1.02] transition-transform duration-500">
             <Image
                src={game.coverImage || game.backgroundImage || ''}
                alt={game.title}
                fill
                className="object-cover"
                sizes="150px"
            />
            <div className="absolute bottom-1 right-1 rounded bg-black/80 p-1 backdrop-blur-md border border-white/10">
                 {isSteam ? <Gamepad2 className="h-3 w-3 text-white" /> : <Monitor className="h-3 w-3 text-white/50" />}
            </div>
        </div>

        {/* Column 2: Main Content */}
        <div className="flex flex-col justify-between min-w-0 py-1 relative">
            <div>
                {/* Title: Text Shadow added for readability against raw background */}
                <h2 className="text-lg sm:text-xl font-black uppercase leading-tight text-white line-clamp-2 tracking-tight drop-shadow-lg pr-12">
                    {game.title}
                </h2>

                {/* Metadata: Lighter text colors + Drop shadow for readability */}
                <div className="flex items-center gap-2 font-inter text-xs font-medium text-zinc-300 mt-1.5 drop-shadow-md">
                    {releaseYear && <span className="text-zinc-200">{releaseYear}</span>}
                    {releaseYear && <span className="text-zinc-500">|</span>}
                    <span className="truncate max-w-[140px] text-zinc-200">{developer}</span>
                </div>

                {/* Tags: Blank Glassmorphism Style */}
                {genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {genres.slice(0, 2).map((genre: string) => (
                            <span key={genre} className="px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-sm">
                                {genre}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Progress Section */}
            <div className="w-full mt-auto">
                <div className="flex justify-between items-end mb-1.5 px-0.5 drop-shadow-md">
                     <span className="text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1">
                        {isCompleted && <Check className="w-3 h-3 text-yellow-500" />}
                        {playedHours}h Played
                     </span>
                     <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                        {targetType} {totalHours ? `/ ${totalHours}h` : ''}
                     </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner">
                    <motion.div
                        className={cn(
                            "absolute inset-y-0 left-0 shadow-[0_0_10px_rgba(255,255,255,0.3)]",
                            isCompleted ? "bg-gradient-to-r from-yellow-600 to-yellow-400" : "bg-gradient-to-r from-blue-600 to-cyan-400"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </div>
            </div>
        </div>

        {/* Absolute Score Overlay */}
        {scores.metacritic && (
            <div className="absolute top-3 right-3 z-30 pointer-events-none">
                <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 bg-black/60 backdrop-blur-md shadow-xl",
                    getScoreColor(scores.metacritic)
                )}>
                    <span className="text-sm font-black font-mono tracking-tighter">
                        {scores.metacritic}
                    </span>
                </div>
            </div>
        )}

      </div>
    </motion.div>
  );
}
