'use client';

import { useState, useEffect } from 'react';
import { type UserLibrary, type Game, type Tag } from '@prisma/client';
import { GameCard } from './GameCard';
import { FilterStrip } from './FilterStrip';
import { calculateProgress } from '@/lib/format-utils';
import { AddGameWizardDialog } from './AddGameWizardDialog';
import SteamImportModal from './SteamImportModal';
import { EditGameModal } from './EditGameModal';
import { Button } from '@/components/ui/button';
import { Plus, Search, Trash2, X, CheckSquare, Square, Pencil, MoreHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AnimatePresence, motion } from 'framer-motion';
import { removeGamesFromLibrary, updateGamesStatus } from '@/actions/library';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface DashboardProps {
    initialLibrary: GameWithLibrary[];
    userPaceFactor?: number;
}

type SortOption = 'dateAdded' | 'progress' | 'releaseDate';
type StatusFilter = 'All' | 'PLAYING' | 'BACKLOG' | 'COMPLETED' | 'WISHLIST' | 'ABANDONED';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'WISHLIST', label: 'Wishlist' },
    { id: 'BACKLOG', label: 'Backlog' },
    { id: 'PLAYING', label: 'Playing' },
    { id: 'COMPLETED', label: 'Completed' },
    { id: 'ABANDONED', label: 'Abandoned' },
    { id: 'All', label: 'All Games' },
];

export function Dashboard({ initialLibrary, userPaceFactor = 1.0 }: DashboardProps) {
    const [library, setLibrary] = useState<GameWithLibrary[]>(initialLibrary);

    useEffect(() => {
        setLibrary(initialLibrary);
    }, [initialLibrary]);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('PLAYING');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('dateAdded');

    // Modal states
    const [isAddGameOpen, setIsAddGameOpen] = useState(false);
    const [selectedGame, setSelectedGame] = useState<GameWithLibrary | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Edit Mode State (formerly Delete Mode)
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    // Bulk Edit States
    const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
    const [targetStatus, setTargetStatus] = useState<string>('BACKLOG');
    const [isActionsOpen, setIsActionsOpen] = useState(false);

    const toggleEditMode = () => {
        setIsEditMode(!isEditMode);
        setSelectedGameIds(new Set());
        setIsActionsOpen(false);
    };

    const toggleSelection = (gameId: string) => {
        const newSelected = new Set(selectedGameIds);
        if (newSelected.has(gameId)) {
            newSelected.delete(gameId);
        } else {
            newSelected.add(gameId);
        }
        setSelectedGameIds(newSelected);
    };

    const toggleSelectAll = () => {
        if (selectedGameIds.size === filteredLibrary.length) {
            setSelectedGameIds(new Set());
        } else {
            setSelectedGameIds(new Set(filteredLibrary.map(g => g.gameId)));
        }
    };

    const handleDelete = async () => {
        if (selectedGameIds.size === 0) return;

        try {
            const idsToDelete = Array.from(selectedGameIds);
            // Optimistic Update: Immediately remove from local state
            setLibrary(prev => prev.filter(g => !selectedGameIds.has(g.gameId)));

            await removeGamesFromLibrary(idsToDelete);

            setIsDeleteConfirmOpen(false);
            setIsEditMode(false);
            setSelectedGameIds(new Set());
        } catch (error) {
            console.error("Failed to delete games", error);
            // Revert on error could be implemented here
        }
    };

    const handleBulkStatusChange = async () => {
        if (selectedGameIds.size === 0) return;

        try {
            const idsToUpdate = Array.from(selectedGameIds);

            // Optimistic update
            setLibrary(prev => prev.map(item => {
                if (selectedGameIds.has(item.gameId)) {
                    return { ...item, status: targetStatus };
                }
                return item;
            }));

            await updateGamesStatus(idsToUpdate, targetStatus);

            setIsBulkStatusOpen(false);
            setIsEditMode(false);
            setSelectedGameIds(new Set());
        } catch (error) {
            console.error("Failed to update status", error);
        }
    };

    // Filter Logic
    const filteredLibrary = library.filter(item => {
        // Status
        if (statusFilter !== 'All' && item.status.toUpperCase() !== statusFilter.toUpperCase()) return false;

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!item.game.title.toLowerCase().includes(query)) return false;
        }

        return true;
    });

    // Sort Logic
    const sortedLibrary = [...filteredLibrary].sort((a, b) => {
        switch (sortBy) {
            case 'dateAdded':
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            case 'progress':
                const progressA = calculateProgress(a.playtimeManual ?? a.playtimeSteam ?? 0, {
                    main: a.game.hltbMain,
                    extra: a.game.hltbExtra,
                    completionist: a.game.hltbCompletionist
                }, a.targetedCompletionType || 'Main');
                const progressB = calculateProgress(b.playtimeManual ?? b.playtimeSteam ?? 0, {
                    main: b.game.hltbMain,
                    extra: b.game.hltbExtra,
                    completionist: b.game.hltbCompletionist
                }, b.targetedCompletionType || 'Main');
                return progressB - progressA;
            case 'releaseDate':
                const dateA = a.game.releaseDate ? new Date(a.game.releaseDate).getTime() : 0;
                const dateB = b.game.releaseDate ? new Date(b.game.releaseDate).getTime() : 0;
                return dateB - dateA;
            default:
                return 0;
        }
    });

    const handleGameClick = (item: GameWithLibrary) => {
        setSelectedGame(item);
        setIsEditModalOpen(true);
    };

    return (
        <div className="space-y-4 md:space-y-6 px-0 md:px-2 pb-20 md:pb-0">
            {/* Header Actions */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search your library..."
                        className="pl-9 bg-muted/50 border-muted-foreground/20"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-full md:w-auto"
                    >
                        <option value="dateAdded">Recently Added</option>
                        <option value="progress">Progress</option>
                        <option value="releaseDate">Release Date</option>
                    </select>

                    <SteamImportModal />
                    <Button onClick={() => setIsAddGameOpen(true)} className="whitespace-nowrap">
                        <Plus className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Add Game</span>
                    </Button>

                    {isEditMode ? (
                        <>
                            <Button variant="outline" onClick={toggleEditMode} size="icon" className="shrink-0">
                                <X className="h-4 w-4" />
                            </Button>

                            <Popover open={isActionsOpen} onOpenChange={setIsActionsOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="default" disabled={selectedGameIds.size === 0} className="whitespace-nowrap gap-2">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="hidden md:inline">Actions ({selectedGameIds.size})</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-48 p-2" align="end">
                                    <div className="flex flex-col gap-1">
                                        <Button
                                            variant="ghost"
                                            className="justify-start w-full"
                                            onClick={() => {
                                                setIsActionsOpen(false);
                                                setIsBulkStatusOpen(true);
                                            }}
                                        >
                                            Change Status
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            className="justify-start w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => {
                                                setIsActionsOpen(false);
                                                setIsDeleteConfirmOpen(true);
                                            }}
                                        >
                                            Delete Games
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </>
                    ) : (
                        <Button variant="secondary" size="icon" onClick={toggleEditMode} className="shrink-0">
                            <Pencil className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {isEditMode && (
                <div className="flex justify-end -mt-2 mb-2">
                    <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                        {selectedGameIds.size === filteredLibrary.length && filteredLibrary.length > 0 ? (
                            <>
                                <CheckSquare className="h-4 w-4 mr-2" /> Unselect All
                            </>
                        ) : (
                            <>
                                <Square className="h-4 w-4 mr-2" /> Select All
                            </>
                        )}
                    </Button>
                </div>
            )}

            {/* Horizontal Filter Strip */}
            <FilterStrip
                filters={STATUS_FILTERS}
                activeFilter={statusFilter}
                onFilterChange={(id) => setStatusFilter(id as StatusFilter)}
            />

            {/* Grid/List Layout */}
            <motion.div
                layout
                className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-4"
            >
                <AnimatePresence mode="popLayout">
                    {sortedLibrary.length === 0 ? (
                        <motion.div
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="col-span-full py-12 text-center text-muted-foreground"
                        >
                            <p className="text-lg">No games found in {statusFilter === 'All' ? 'your library' : statusFilter}.</p>
                            {statusFilter === 'All' && (
                                <Button variant="link" onClick={() => setIsAddGameOpen(true)} className="mt-2">
                                    Add your first game
                                </Button>
                            )}
                        </motion.div>
                    ) : (
                        sortedLibrary.map((item) => (
                            <GameCard
                                key={item.id}
                                item={item}
                                paceFactor={userPaceFactor}
                                onClick={() => handleGameClick(item)}
                                isDeleteMode={isEditMode}
                                isSelected={selectedGameIds.has(item.gameId)}
                                onToggleSelect={() => toggleSelection(item.gameId)}
                            />
                        ))
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Modals */}
            <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Deletion</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove {selectedGameIds.size} game{selectedGameIds.size !== 1 && 's'} from your library?
                            This action cannot be undone, but the games will remain in the database.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete}>Delete Games</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Status Dialog */}
            <Dialog open={isBulkStatusOpen} onOpenChange={setIsBulkStatusOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Change Status</DialogTitle>
                        <DialogDescription>
                            Select the new status for {selectedGameIds.size} game{selectedGameIds.size !== 1 && 's'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="status" className="text-right">
                                Status
                            </Label>
                            <div className="col-span-3">
                                <Select value={targetStatus} onValueChange={setTargetStatus}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="BACKLOG">Backlog</SelectItem>
                                        <SelectItem value="PLAYING">Playing</SelectItem>
                                        <SelectItem value="COMPLETED">Completed</SelectItem>
                                        <SelectItem value="ABANDONED">Abandoned</SelectItem>
                                        <SelectItem value="WISHLIST">Wishlist</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsBulkStatusOpen(false)}>Cancel</Button>
                        <Button onClick={handleBulkStatusChange}>Update Status</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* <AddGameModal isOpen={isAddGameOpen} onClose={() => setIsAddGameOpen(false)} /> */}
            <AddGameWizardDialog isOpen={isAddGameOpen} onClose={() => setIsAddGameOpen(false)} />

            {selectedGame && (
                <EditGameModal
                    item={selectedGame}
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setSelectedGame(null);
                    }}
                />
            )}
        </div>
    );
}
