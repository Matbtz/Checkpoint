'use client';

import { useMemo, useState, memo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { type UserLibrary, type Game } from '@prisma/client';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

type GameWithLibrary = UserLibrary & { game: Game };

interface VerticalGameCardProps {
    item: GameWithLibrary;
    paceFactor?: number;
    onGameClick?: (item: GameWithLibrary) => void;
    isDeleteMode?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (gameId: string) => void;
}

export const VerticalGameCard = memo(function VerticalGameCard({
    item,
    paceFactor = 1.0,
    onGameClick,
    isDeleteMode,
    isSelected,
    onToggleSelect
}: VerticalGameCardProps) {
    const { game } = item;

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

    const targetMinutes = targetHours * 60;
    const rawProgress = targetMinutes > 0 ? (playedMinutes / targetMinutes) * 100 : 0;
    const progress = Math.min(rawProgress, 100);
    const isCompleted = rawProgress >= 100;

    // Use custom cover if available, fallback to game cover
    const [currentCoverImage, setCurrentCoverImage] = useState(item.customCoverImage || game.coverImage || '/placeholder.png');

    useEffect(() => {
        setCurrentCoverImage(item.customCoverImage || game.coverImage || '/placeholder.png');
    }, [item.customCoverImage, game.coverImage]);

    return (
        <motion.div
            layoutId={game.id}
            whileHover={{ scale: 1.05 }}
            className={cn(
                "group flex flex-col w-full",
                isSelected && "ring-2 ring-red-500 rounded-lg p-1"
            )}
        >
            <div
                className="relative w-full aspect-[2/3] overflow-hidden rounded-lg bg-zinc-900 shadow-md cursor-pointer"
                onClick={() => {
                    if (isDeleteMode && onToggleSelect) {
                        onToggleSelect(item.gameId);
                    } else if (onGameClick) {
                        onGameClick(item);
                    }
                }}
            >
                {/* Delete Overlay */}
                {isDeleteMode && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
                        <div className={cn(
                            "h-6 w-6 rounded border-2 flex items-center justify-center transition-all",
                            isSelected ? "bg-red-500 border-red-500" : "border-white/60 bg-black/40"
                        )}>
                            {isSelected && <div className="h-2 w-2 bg-white rounded-full" />}
                        </div>
                    </div>
                )}

                <Image
                    src={currentCoverImage}
                    alt={game.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 16vw"
                    onError={() => {
                        if (currentCoverImage.includes('library_600x900.jpg')) {
                            setCurrentCoverImage(currentCoverImage.replace('library_600x900.jpg', 'portrait.png'));
                        }
                    }}
                />

                {/* Progress Bar Overlay */}
                <div className="absolute bottom-0 left-0 right-0">
                    <div className="h-1.5 w-full bg-black/50 backdrop-blur-sm">
                        <div
                            className={cn(
                                "h-full transition-all duration-1000",
                                isCompleted ? "bg-yellow-500" : "bg-gradient-to-r from-blue-600 to-cyan-400"
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Title Below */}
            <Link
                href={`/game/${game.id}`}
                className="mt-2 text-sm font-bold text-center leading-tight hover:underline line-clamp-2"
                onClick={(e) => e.stopPropagation()}
            >
                {game.title}
            </Link>
        </motion.div>
    );
});
