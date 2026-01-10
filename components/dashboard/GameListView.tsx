'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { type UserLibrary, type Game } from '@prisma/client';
import { updateLibraryEntry } from '@/actions/library';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from 'date-fns';
import { Check, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';

type GameWithLibrary = UserLibrary & { game: Game };

interface GameListRowProps {
    item: GameWithLibrary;
    paceFactor?: number;
    onGameClick?: (item: GameWithLibrary) => void;
    isDeleteMode?: boolean;
    isSelected?: boolean;
    onToggleSelect?: (gameId: string) => void;
}

export function GameListRow({
    item,
    paceFactor = 1.0,
    onGameClick,
    isDeleteMode,
    isSelected,
    onToggleSelect
}: GameListRowProps) {
    const { game } = item;
    const [isHovered, setIsHovered] = useState(false);

    // Image fallback logic: custom -> cover -> background -> placeholder
    const [currentCoverImage, setCurrentCoverImage] = useState(
        item.customCoverImage || game.coverImage || game.backgroundImage || '/placeholder.png'
    );

    useEffect(() => {
        setCurrentCoverImage(item.customCoverImage || game.coverImage || game.backgroundImage || '/placeholder.png');
    }, [item.customCoverImage, game.coverImage, game.backgroundImage]);

    // Derived state
    const targetType = item.targetedCompletionType || 'Main';

    // Playtime Calculation
    const playedMinutes = item.playtimeManual ?? item.playtimeSteam ?? 0;
    const playedHours = Math.round(playedMinutes / 60 * 10) / 10;

    // Target Calculation
    const adjustedHltbTimes = {
        main: (game.hltbMain || 0) * paceFactor,
        extra: (game.hltbExtra || 0) * paceFactor,
        completionist: (game.hltbCompletionist || 0) * paceFactor
    };

    let targetHours = 0;
    const normalizedTarget = targetType.toLowerCase();
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

    // Handlers
    const handleStatusChange = (value: string) => {
        updateLibraryEntry(item.id, { status: value });
    };

    const handleTargetChange = (value: string) => {
        updateLibraryEntry(item.id, { targetedCompletionType: value });
    };

    const handlePlaytimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
            const minutes = Math.round(val * 60);
            updateLibraryEntry(item.id, { playtimeManual: minutes, isManualProgress: true });
        }
    };

    const toggleManualOverride = (checked: boolean) => {
        if (checked) {
             // Enable manual override with current steam time if no manual time set
             const current = item.playtimeManual ?? item.playtimeSteam;
             updateLibraryEntry(item.id, { isManualProgress: true, playtimeManual: current });
        } else {
             // Disable manual override
             updateLibraryEntry(item.id, { isManualProgress: false, playtimeManual: null });
        }
    };

    const handleRowClick = () => {
        if (isDeleteMode && onToggleSelect) {
            onToggleSelect(item.gameId);
        } else if (onGameClick) {
            onGameClick(item);
        }
    };

    return (
        <motion.tr
            layoutId={game.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
                "group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer",
                isSelected && "bg-muted"
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleRowClick}
        >
            {/* Selection Checkbox (Visible in Delete Mode) */}
            {isDeleteMode && (
                <td className="w-12 px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect?.(item.gameId)} />
                </td>
            )}

            {/* Color Strip */}
            <td className="w-1 p-0">
                 <div
                    className="h-12 w-1.5 rounded-r-md"
                    style={{ backgroundColor: item.primaryColor || game.primaryColor || '#27272a' }}
                 />
            </td>

            {/* Game Info */}
            <td className="px-4 py-2 min-w-[200px]">
                <div className="flex items-center gap-3">
                    <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded shadow-sm bg-muted/50">
                        <Image
                            src={currentCoverImage}
                            alt={game.title}
                            fill
                            className="object-cover"
                            onError={() => {
                                // 1. Try Steam portrait fallback
                                if (currentCoverImage.includes('library_600x900.jpg')) {
                                    const newUrl = currentCoverImage.replace('library_600x900.jpg', 'portrait.png');
                                    if (newUrl !== currentCoverImage) {
                                        setCurrentCoverImage(newUrl);
                                        return;
                                    }
                                }
                                // 2. Fallback to background image if we haven't tried it yet and it exists
                                if (game.backgroundImage && currentCoverImage !== game.backgroundImage && !currentCoverImage.includes('portrait.png')) {
                                    setCurrentCoverImage(game.backgroundImage);
                                    return;
                                }
                                // 3. Final fallback
                                if (currentCoverImage !== '/placeholder.png') {
                                    setCurrentCoverImage('/placeholder.png');
                                }
                            }}
                        />
                    </div>
                    <div>
                        <Link
                            href={`/game/${game.id}`}
                            className="font-medium hover:underline block truncate max-w-[150px] sm:max-w-[200px] md:max-w-xs"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {game.title}
                        </Link>
                         {/* Mobile: Show minimal status info */}
                        <div className="md:hidden text-xs text-muted-foreground flex items-center gap-2 mt-1">
                             <span className={cn(
                                 "w-2 h-2 rounded-full inline-block",
                                 item.status === 'PLAYING' ? "bg-green-500" :
                                 item.status === 'COMPLETED' ? "bg-yellow-500" : "bg-zinc-500"
                             )}/>
                             {item.status}
                        </div>
                    </div>
                </div>
            </td>

            {/* Release Date (Hidden on Mobile) */}
            <td className="hidden md:table-cell px-4 py-2 text-sm text-muted-foreground">
                {game.releaseDate ? format(new Date(game.releaseDate), 'MMM yyyy') : '-'}
            </td>

            {/* Status (Hidden on Mobile) */}
            <td className="hidden md:table-cell px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <Select defaultValue={item.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="BACKLOG">Backlog</SelectItem>
                        <SelectItem value="PLAYING">Playing</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="ABANDONED">Abandoned</SelectItem>
                        <SelectItem value="WISHLIST">Wishlist</SelectItem>
                    </SelectContent>
                </Select>
            </td>

             {/* Objective (Hidden on Mobile) */}
             <td className="hidden lg:table-cell px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <Select defaultValue={targetType} onValueChange={handleTargetChange}>
                    <SelectTrigger className="h-8 w-[110px] text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Main">Main</SelectItem>
                        <SelectItem value="Extra">Main + Extra</SelectItem>
                        <SelectItem value="100%">100%</SelectItem>
                    </SelectContent>
                </Select>
            </td>

            {/* Playtime (Editable) */}
            <td className="hidden sm:table-cell px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        defaultValue={playedHours}
                        className="h-8 w-16 text-xs text-right"
                        step="0.1"
                        onBlur={handlePlaytimeChange}
                        disabled={!item.isManualProgress}
                    />
                    <span className="text-xs text-muted-foreground">h</span>
                    <Checkbox
                        checked={item.isManualProgress}
                        onCheckedChange={toggleManualOverride}
                        className="h-4 w-4"
                        title="Manual Override"
                    />
                </div>
            </td>

            {/* Progress Bar */}
            <td className="px-4 py-2 w-[150px] sm:w-[200px]">
                <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-semibold">
                        <span>{Math.round(progress)}%</span>
                        {targetHours > 0 && <span>{Math.round(targetHours)}h Goal</span>}
                    </div>
                    <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full transition-all duration-500",
                                isCompleted ? "bg-yellow-500" : "bg-primary"
                            )}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </td>
        </motion.tr>
    );
}

export function GameListView({
    items,
    paceFactor,
    onGameClick,
    isDeleteMode,
    selectedGameIds,
    onToggleSelect
}: {
    items: GameWithLibrary[],
    paceFactor: number,
    onGameClick: any,
    isDeleteMode: boolean,
    selectedGameIds: Set<string>,
    onToggleSelect: any
}) {
    return (
        <div className="w-full overflow-hidden rounded-md border">
            <table className="w-full caption-bottom text-sm text-left">
                <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        {isDeleteMode && <th className="h-12 px-4 align-middle font-medium text-muted-foreground w-12"></th>}
                        <th className="h-12 w-1 p-0"></th>
                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Game</th>
                        <th className="hidden md:table-cell h-12 px-4 align-middle font-medium text-muted-foreground">Release</th>
                        <th className="hidden md:table-cell h-12 px-4 align-middle font-medium text-muted-foreground">Status</th>
                        <th className="hidden lg:table-cell h-12 px-4 align-middle font-medium text-muted-foreground">Objective</th>
                        <th className="hidden sm:table-cell h-12 px-4 align-middle font-medium text-muted-foreground">Playtime</th>
                        <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Progress</th>
                    </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {items.map(item => (
                        <GameListRow
                            key={item.id}
                            item={item}
                            paceFactor={paceFactor}
                            onGameClick={onGameClick}
                            isDeleteMode={isDeleteMode}
                            isSelected={selectedGameIds.has(item.gameId)}
                            onToggleSelect={onToggleSelect}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
