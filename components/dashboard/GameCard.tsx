'use client';

import { useMemo, useState, useEffect, memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { type UserLibrary, type Game } from '@prisma/client';
import { calculateProgress } from '@/lib/format-utils';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Gamepad2, Monitor, Check, TriangleAlert } from 'lucide-react';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card"

type ExtendedGame = Game & {
    studio?: string | null;
};

type GameWithLibrary = UserLibrary & { game: Game };

interface GameCardProps {
    item: GameWithLibrary;
    paceFactor?: number;
    onGameClick?: (item: GameWithLibrary) => void;
    primaryColor?: string;
    secondaryColor?: string;
    isDeleteMode?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (gameId: string) => void;
}

export const GameCard = memo(function GameCard({ item, paceFactor = 1.0, onGameClick, isDeleteMode, isSelected, onToggleSelect }: GameCardProps) {
    const { game } = item;
    const extendedGame = game as ExtendedGame;

    const genres = useMemo(() => {
        try {
            return game.genres ? JSON.parse(game.genres) : [];
        } catch {
            return [];
        }
    }, [game.genres]);

    const playedMinutes = item.playtimeManual ?? item.playtimeSteam ?? 0;
    const targetType = item.targetedCompletionType || 'Main';

    const adjustedHltbTimes = useMemo(() => {
        const times = {
            main: game.hltbMain || 0,
            extra: game.hltbExtra || 0,
            completionist: game.hltbCompletionist || 0
        };

        if (times.main) times.main *= paceFactor;
        if (times.extra) times.extra *= paceFactor;
        if (times.completionist) times.completionist *= paceFactor;
        return times;
    }, [game, paceFactor]);

    // calculateProgress caps at 100, but we want to detect over-limit for icon.
    // We can recalculate raw percentage here if needed, or rely on isOverLimit logic.
    // calculateProgress returns capped value.
    // Let's compute raw manually for isOverLimit check.

    // Normalize target selection
    const normalizedTarget = targetType.toLowerCase();
    let targetHours = 0;
    if (normalizedTarget === '100%' || normalizedTarget === 'completionist') {
        targetHours = adjustedHltbTimes.completionist;
    } else if (normalizedTarget === 'extra' || normalizedTarget === 'main + extra') {
        targetHours = adjustedHltbTimes.extra;
    } else {
        targetHours = adjustedHltbTimes.main;
    }

    // Convert target hours to minutes for progress calculation
    const targetMinutes = targetHours * 60;

    const rawProgress = targetMinutes > 0 ? (playedMinutes / targetMinutes) * 100 : 0;
    const progress = Math.min(rawProgress, 100);

    const playedHours = Math.round(playedMinutes / 60);
    const totalHours = targetHours ? Math.round(targetHours) : null;

    const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;
    const developer = extendedGame.studio || "Unknown Studio";
    const isSteam = (item.playtimeSteam && item.playtimeSteam > 0) || false;
    const isCompleted = rawProgress >= 100;
    const isOverLimit = rawProgress > 130;

    const defaultPrimaryColor = '#27272a'; // Zinc-800
    const defaultSecondaryColor = '#09090b'; // Zinc-950

    const activePrimaryColor = item.primaryColor || game.primaryColor || defaultPrimaryColor;
    const activeSecondaryColor = item.secondaryColor || game.secondaryColor || defaultSecondaryColor;
    const glowColor = activePrimaryColor;

    // Manage image state locally to handle fallbacks
    const [currentCoverImage, setCurrentCoverImage] = useState(item.customCoverImage || game.coverImage || game.backgroundImage || '');

    useEffect(() => {
        setCurrentCoverImage(item.customCoverImage || game.coverImage || game.backgroundImage || '');
    }, [item.customCoverImage, game.coverImage, game.backgroundImage]);


    return (
        <motion.div
            layoutId={game.id}
            whileHover={{ scale: 1.02 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{
                opacity: 1,
                y: 0,
                boxShadow: [
                    `0 0 0px 0px ${glowColor}00`,
                    `0 0 30px -5px ${glowColor}50`,
                    `0 0 0px 0px ${glowColor}00`
                ]
            }}
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
                "group relative w-full min-h-[150px] overflow-hidden rounded-2xl bg-zinc-950 cursor-pointer transition-all mb-4"
            )}
            style={{
                backgroundImage: `linear-gradient(#09090b, #09090b), linear-gradient(to bottom right, ${activePrimaryColor}, ${activeSecondaryColor})`,
                backgroundOrigin: 'border-box',
                backgroundClip: 'padding-box, border-box',
                border: '2px solid transparent',
            }}
            onClick={() => {
                if (isDeleteMode && onToggleSelect) {
                    onToggleSelect(item.gameId);
                } else if (onGameClick) {
                    onGameClick(item);
                }
            }}
        >
            {isDeleteMode && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleSelect) onToggleSelect(item.gameId);
                    }}
                    className={cn(
                        "absolute inset-0 z-50 flex items-center justify-center bg-black/20 transition-all w-full h-full cursor-pointer",
                        isSelected ? "bg-red-500/20 ring-2 ring-red-500" : "hover:bg-black/40 focus:bg-black/40"
                    )}
                    aria-label={`Select ${game.title}`}
                    aria-pressed={isSelected}
                >
                    <div className={cn(
                        "absolute top-3 left-3 h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all shadow-lg",
                        isSelected ? "bg-red-500 border-red-500 scale-110" : "border-white/60 bg-black/40"
                    )}>
                        {isSelected && <Check className="h-4 w-4 text-white font-bold" />}
                    </div>
                </button>
            )}

            {/* Layer 1: Background Art */}
            <div className="absolute inset-0 z-0 select-none pointer-events-none">
                <Image
                    src={game.backgroundImage || game.coverImage || ''}
                    alt=""
                    fill
                    className="object-cover opacity-100"
                    priority={false}
                    style={{
                        maskImage: 'linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 10%, rgba(0,0,0,0.72) 20%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.5) 40%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.72) 80%, rgba(0,0,0,0.85) 90%, rgba(0,0,0,1) 100%)',
                        WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 10%, rgba(0,0,0,0.75) 20%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.75) 80%, rgba(0,0,0,0.9) 90%, rgba(0,0,0,1) 100%)'
                    }}
                />
            </div>

            {/* Layer 2: Content Grid */}
            <div className="relative z-20 grid h-full grid-cols-[100px_1fr] gap-4 p-3.5">

                {/* Column 1: Cover Art */}
                <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden rounded-lg shadow-2xl ring-1 ring-white/10 group-hover:scale-[1.02] transition-transform duration-500">
                    <Link href={`/game/${game.id}`} onClick={(e) => e.stopPropagation()} className="block w-full h-full relative">
                        <Image
                            src={currentCoverImage}
                            alt={game.title}
                            fill
                            className="object-cover"
                            sizes="150px"
                            onError={() => {
                                if (currentCoverImage.includes('library_600x900.jpg')) {
                                    setCurrentCoverImage(currentCoverImage.replace('library_600x900.jpg', 'portrait.png'));
                                }
                            }}
                        />
                    </Link>
                    <div className="absolute bottom-1 right-1 rounded bg-black/80 p-1 backdrop-blur-md border border-white/10 pointer-events-none">
                        {isSteam ? <Gamepad2 className="h-3 w-3 text-white" /> : <Monitor className="h-3 w-3 text-white/50" />}
                    </div>
                </div>

                {/* Column 2: Main Content */}
                <div className="flex flex-col justify-between min-w-0 py-1 relative">
                    <div>
                        <h2 className="text-lg sm:text-xl font-black uppercase leading-tight text-white line-clamp-2 tracking-tight drop-shadow-lg pr-12">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onGameClick?.(item);
                                }}
                                className="text-left hover:underline focus:underline focus:outline-none"
                            >
                                {game.title}
                            </button>
                        </h2>

                        <div className="flex items-center gap-2 font-inter text-xs font-medium text-zinc-300 mt-1.5 drop-shadow-md">
                            {releaseYear && <span className="text-zinc-200">{releaseYear}</span>}
                            {releaseYear && <span className="text-zinc-500">|</span>}
                            <span className="truncate max-w-[140px] text-zinc-200">{developer}</span>
                        </div>

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
                                {isOverLimit ? (
                                    <HoverCard>
                                        <HoverCardTrigger asChild>
                                            <TriangleAlert className="w-3 h-3 text-amber-500 cursor-help" />
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-64 text-xs bg-zinc-900 text-white border-zinc-800 p-2 z-[60]">
                                            You have exceeded 130% of the estimated time for {targetType}. Is this the correct goal?
                                        </HoverCardContent>
                                    </HoverCard>
                                ) : isCompleted ? (
                                    <Check className="w-3 h-3 text-yellow-500" />
                                ) : null}
                                {playedHours}h Played
                            </span>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                                {targetType} {totalHours ? `/ ${totalHours}h` : ''}
                            </span>
                        </div>
                        <div
                            className="relative h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner"
                            role="progressbar"
                            aria-valuenow={Math.round(progress)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`Progress: ${Math.round(progress)}% of ${targetType}`}
                        >
                            <motion.div
                                className={cn(
                                    "absolute inset-y-0 left-0 shadow-[0_0_10px_rgba(255,255,255,0.3)]",
                                    isCompleted ? "bg-yellow-500" : "bg-gradient-to-r from-blue-600 to-cyan-400"
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                    </div>
                </div>


            </div>
        </motion.div>
    );
});
