'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { updateLibraryEntry, fixGameMatch, extractColorsAction } from '@/actions/library';
import { updateGameMetadata, searchGameImages } from '@/actions/game';
import { fetchExternalMetadata, searchMetadataCandidates, MetadataCandidate, ExternalMetadata } from '@/actions/fetch-metadata';
import { assignTag, removeTag, getUserTags, createTag } from '@/actions/tag';
import { Game, UserLibrary, Tag } from '@prisma/client';
import { Loader2, Plus, X, ChevronDown, ChevronRight, RefreshCw, BadgeInfo, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { HLTBCard } from '@/components/game/HLTBCard';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

// Add isManualProgress to UserLibrary type for TS, assuming db migration is applied or will be
type UserLibraryExtended = UserLibrary & { isManualProgress?: boolean };
type GameWithLibraryExtended = UserLibraryExtended & { game: Game; tags?: Tag[] };

interface EditGameModalProps {
    item: GameWithLibraryExtended;
    isOpen: boolean;
    onClose: () => void;
}

function TagBadge({ tag, initiallySelected, libraryId }: { tag: Tag; initiallySelected: boolean; libraryId: string }) {
    const [isSelected, setIsSelected] = useState(initiallySelected);
    const [loading, setLoading] = useState(false);

    const toggle = async () => {
        setLoading(true);
        if (isSelected) {
            await removeTag(libraryId, tag.id);
        } else {
            await assignTag(libraryId, tag.id);
        }
        setIsSelected(!isSelected);
        setLoading(false);
    };

    return (
        <button
            onClick={toggle}
            disabled={loading}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${isSelected
                ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                } ${loading ? 'opacity-50' : ''}`}
        >
            {tag.name}
        </button>
    );
}

export function EditGameModal({ item, isOpen, onClose }: EditGameModalProps) {
    const [activeTab, setActiveTab] = useState("general");
    const [loading, setLoading] = useState(false);

    // --- GENERAL TAB STATE ---
    const [status, setStatus] = useState(item.status);
    const [completionType, setCompletionType] = useState(item.targetedCompletionType || 'Main');
    const [ownedPlatforms, setOwnedPlatforms] = useState<string[]>(item.ownedPlatforms || []);

    // Time
    const initialMinutes = item.playtimeManual !== null ? item.playtimeManual : (item.playtimeSteam || 0);
    const initialHours = Math.round((initialMinutes / 60) * 10) / 10;
    const [useManualTime, setUseManualTime] = useState(item.playtimeManual !== null);
    const [manualTimeHours, setManualTimeHours] = useState(initialHours.toString());

    // Progress
    const [isManualProgress, setIsManualProgress] = useState(item.isManualProgress || false);
    const [progressValue, setProgressValue] = useState(item.progressManual?.toString() || '0');

    // Fix Match (HLTB)
    const [showFixMatch, setShowFixMatch] = useState(false);
    const [hltbMain, setHltbMain] = useState(item.game.hltbMain || 0);
    const [hltbExtra, setHltbExtra] = useState(item.game.hltbExtra || 0);
    const [hltbCompletionist, setHltbCompletionist] = useState(item.game.hltbCompletionist || 0);

    // User Completion Times
    const [playtimeMain, setPlaytimeMain] = useState(item.playtimeMain?.toString() || "");
    const [playtimeExtra, setPlaytimeExtra] = useState(item.playtimeExtra?.toString() || "");
    const [playtimeCompletionist, setPlaytimeCompletionist] = useState(item.playtimeCompletionist?.toString() || "");

    // Tags
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [newTagName, setNewTagName] = useState("");

    // --- METADATA TAB STATE ---
    // Read-only logic: Store displayed values
    const [metaTitle, setMetaTitle] = useState(item.game.title);
    const [metaStudio, setMetaStudio] = useState(item.game.studio || "");
    const [metaReleaseDate, setMetaReleaseDate] = useState(item.game.releaseDate ? new Date(item.game.releaseDate).toISOString().split('T')[0] : "");
    const [metaGenres, setMetaGenres] = useState<string[]>(item.game.genres ? JSON.parse(item.game.genres) : []);

    // Platforms handling
    const [metaPlatforms, setMetaPlatforms] = useState<string[]>(() => {
        const p = item.game.platforms;
        if (Array.isArray(p)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return p.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean);
        }
        return [];
    });

    const [metaOpencritic, setMetaOpencritic] = useState(item.game.opencriticScore?.toString() || "");
    const [metaIgdbScore, setMetaIgdbScore] = useState(item.game.igdbScore?.toString() || "");
    const [metaSteamScore, setMetaSteamScore] = useState(item.game.steamReviewPercent?.toString() || "");
    const [metaFranchise, setMetaFranchise] = useState(item.game.franchise || "");

    // Metadata Search State
    const [isSearchingMetadata, setIsSearchingMetadata] = useState(false);
    const [metaSearchQuery, setMetaSearchQuery] = useState(item.game.title);
    const [metaCandidates, setMetaCandidates] = useState<MetadataCandidate[]>([]);
    const [metaSearchLoading, setMetaSearchLoading] = useState(false);
    const [metaPreviewId, setMetaPreviewId] = useState<string | null>(null);
    const [metaPreviewData, setMetaPreviewData] = useState<ExternalMetadata | null>(null);
    const [metaPreviewLoading, setMetaPreviewLoading] = useState(false);

    // --- MEDIA TAB STATE ---
    const [coverImage, setCoverImage] = useState(item.customCoverImage || item.game.coverImage || "");
    const [backgroundImage, setBackgroundImage] = useState(item.game.backgroundImage || "");
    const [mediaQuery, setMediaQuery] = useState("");
    const [searchedCovers, setSearchedCovers] = useState<string[]>([]);
    const [searchedBackgrounds, setSearchedBackgrounds] = useState<string[]>([]);
    const [searchingMedia, setSearchingMedia] = useState(false);

    // Collapsible states
    const [showFoundCovers, setShowFoundCovers] = useState(true);
    const [showFoundBackgrounds, setShowFoundBackgrounds] = useState(true);

    // Auto-calculate progress
    useEffect(() => {
        if (!isManualProgress) {
            let targetMinutes = 0;
            const normalizedTarget = completionType.toLowerCase();

            if (normalizedTarget === '100%' || normalizedTarget === 'completionist') {
                targetMinutes = hltbCompletionist;
            } else if (normalizedTarget === 'extra' || normalizedTarget === 'main + extra') {
                targetMinutes = hltbExtra;
            } else {
                targetMinutes = hltbMain;
            }

            let currentMinutes = 0;
            if (useManualTime) {
                const m = parseFloat(manualTimeHours);
                if (!isNaN(m)) currentMinutes = m * 60;
            } else {
                currentMinutes = item.playtimeSteam || 0;
            }

            if (targetMinutes > 0) {
                const prog = Math.min(100, Math.round((currentMinutes / targetMinutes) * 100));
                setProgressValue(prog.toString());
            } else {
                setProgressValue('0');
            }
        }
    }, [isManualProgress, useManualTime, manualTimeHours, completionType, hltbMain, hltbExtra, hltbCompletionist, item.playtimeSteam]);


    useEffect(() => {
        if (isOpen) {
            getUserTags().then(setAvailableTags);

            // Reset General
            setStatus(item.status);
            setCompletionType(item.targetedCompletionType || 'Main');
            setOwnedPlatforms(item.ownedPlatforms || []);
            const minutes = item.playtimeManual !== null ? item.playtimeManual : (item.playtimeSteam || 0);
            setUseManualTime(item.playtimeManual !== null);
            setManualTimeHours((Math.round((minutes / 60) * 10) / 10).toString());

            setIsManualProgress(item.isManualProgress || false);
            setProgressValue(item.progressManual?.toString() || '0');

            // Reset Metadata
            setMetaTitle(item.game.title);
            setMetaStudio(item.game.studio || "");
            setMetaReleaseDate(item.game.releaseDate ? new Date(item.game.releaseDate).toISOString().split('T')[0] : "");
            setMetaGenres(item.game.genres ? JSON.parse(item.game.genres) : []);

            if (Array.isArray(item.game.platforms)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setMetaPlatforms(item.game.platforms.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean));
            } else {
                setMetaPlatforms([]);
            }

            setMetaOpencritic(item.game.opencriticScore?.toString() || "");
            setMetaIgdbScore(item.game.igdbScore?.toString() || "");
            setMetaSteamScore(item.game.steamReviewPercent?.toString() || "");
            setMetaFranchise(item.game.franchise || "");

            // Reset Metadata Search
            setIsSearchingMetadata(false);
            setMetaSearchQuery(item.game.title);
            setMetaCandidates([]);
            setMetaPreviewId(null);
            setMetaPreviewData(null);

            // Reset Media
            setCoverImage(item.customCoverImage || item.game.coverImage || "");
            setBackgroundImage(item.game.backgroundImage || "");
            setSearchedCovers([]);
            setSearchedBackgrounds([]);
            setMediaQuery("");
            setShowFoundCovers(true);
            setShowFoundBackgrounds(true);
        }
    }, [isOpen, item]);

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        await createTag(newTagName);
        setNewTagName("");
        const tags = await getUserTags();
        setAvailableTags(tags);
    };

    const handleMediaSearch = async (overrideQuery?: string) => {
        const query = overrideQuery ?? mediaQuery;
        if (!query.trim()) return;

        setSearchingMedia(true);
        const releaseYear = item.game.releaseDate ? new Date(item.game.releaseDate).getFullYear() : undefined;

        const { covers, backgrounds } = await searchGameImages(query, {
            igdbId: item.game.igdbId || undefined,
            releaseYear: releaseYear
        });
        setSearchedCovers(covers);
        setSearchedBackgrounds(backgrounds);
        setSearchingMedia(false);
        // Expand both on search
        setShowFoundCovers(true);
        setShowFoundBackgrounds(true);
    };

    const handleMetadataSearch = async () => {
        if (!metaSearchQuery.trim()) return;
        setMetaSearchLoading(true);
        setMetaCandidates([]);
        setMetaPreviewId(null);
        setMetaPreviewData(null);
        try {
            const results = await searchMetadataCandidates(metaSearchQuery);
            setMetaCandidates(results);
        } catch(e) {
            console.error(e);
        } finally {
            setMetaSearchLoading(false);
        }
    };

    const handleMetadataPreview = async (candidate: MetadataCandidate) => {
        if (metaPreviewId === candidate.id) {
            // Toggle off
            setMetaPreviewId(null);
            setMetaPreviewData(null);
            return;
        }

        setMetaPreviewId(candidate.id);
        setMetaPreviewLoading(true);
        setMetaPreviewData(null);
        try {
            const data = await fetchExternalMetadata(candidate.source, "", candidate.id);
            setMetaPreviewData(data);
        } catch(e) {
            console.error(e);
        } finally {
            setMetaPreviewLoading(false);
        }
    };

    const applyMetadata = (data: ExternalMetadata) => {
        if (data.title) setMetaTitle(data.title);
        if (data.studio) setMetaStudio(data.studio);
        if (data.releaseDate) setMetaReleaseDate(data.releaseDate.toISOString().split('T')[0]);
        if (data.genres) setMetaGenres(data.genres);
        if (data.platforms) setMetaPlatforms(data.platforms);
        if (data.igdbScore !== null) setMetaIgdbScore(data.igdbScore.toString());
        if (data.steamReviewPercent !== null) setMetaSteamScore(data.steamReviewPercent.toString());
        if (data.franchise) setMetaFranchise(data.franchise);
        setIsSearchingMetadata(false);
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // 1. Update Library Entry (General Tab)
            const libData: Partial<Parameters<typeof updateLibraryEntry>[1]> = {};
            if (status !== item.status) libData.status = status;
            if (completionType !== item.targetedCompletionType) libData.targetedCompletionType = completionType;
            if (JSON.stringify(ownedPlatforms.sort()) !== JSON.stringify((item.ownedPlatforms || []).sort())) {
                libData.ownedPlatforms = ownedPlatforms;
            }

            if (useManualTime) {
                const m = parseFloat(manualTimeHours);
                if (!isNaN(m)) libData.playtimeManual = Math.round(m * 60);
            } else {
                libData.playtimeManual = null;
            }

            // Progress Logic
            libData.isManualProgress = isManualProgress;
            const pVal = parseInt(progressValue);
            if (!isNaN(pVal)) {
                libData.progressManual = Math.min(100, Math.max(0, pVal));
            }

            // User Completion Times
            if (playtimeMain.trim()) {
                const val = parseInt(playtimeMain);
                if (!isNaN(val)) libData.playtimeMain = val;
            } else if (item.playtimeMain !== null) {
                libData.playtimeMain = null;
            }
            if (playtimeExtra.trim()) {
                const val = parseInt(playtimeExtra);
                if (!isNaN(val)) libData.playtimeExtra = val;
            } else if (item.playtimeExtra !== null) {
                libData.playtimeExtra = null;
            }
            if (playtimeCompletionist.trim()) {
                const val = parseInt(playtimeCompletionist);
                if (!isNaN(val)) libData.playtimeCompletionist = val;
            } else if (item.playtimeCompletionist !== null) {
                libData.playtimeCompletionist = null;
            }

            // Cover Logic
            const currentEffectiveCover = item.customCoverImage || item.game.coverImage || "";
            const globalCover = item.game.coverImage || "";
            let coverChanged = false;

            if (coverImage !== currentEffectiveCover) {
                coverChanged = true;
                if (coverImage === globalCover) {
                    libData.customCoverImage = null;
                } else {
                    libData.customCoverImage = coverImage;
                }
            }

            const promises = [];
            if (Object.keys(libData).length > 0) promises.push(updateLibraryEntry(item.id, libData));

            if (showFixMatch) {
                promises.push(fixGameMatch(item.gameId, {
                    main: parseFloat(hltbMain.toString()),
                    extra: parseFloat(hltbExtra.toString()),
                    completionist: parseFloat(hltbCompletionist.toString())
                }));
            }

            // 2. Update Game Metadata (Metadata & Media Tabs)
            const metaData: Parameters<typeof updateGameMetadata>[1] = {};

            if (metaTitle !== item.game.title) metaData.title = metaTitle;
            if (metaStudio !== (item.game.studio || "")) metaData.studio = metaStudio;

            const newDate = metaReleaseDate ? new Date(metaReleaseDate) : null;
            const oldDate = item.game.releaseDate ? new Date(item.game.releaseDate) : null;
            if (newDate?.getTime() !== oldDate?.getTime()) metaData.releaseDate = newDate;

            const currentGenres = item.game.genres ? JSON.parse(item.game.genres) : [];
            if (JSON.stringify([...metaGenres].sort()) !== JSON.stringify([...currentGenres].sort())) metaData.genres = metaGenres;

            const currentPlatformsRaw = item.game.platforms;
            const currentPlatforms = Array.isArray(currentPlatformsRaw)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? currentPlatformsRaw.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean)
                : [];
            if (JSON.stringify([...metaPlatforms].sort()) !== JSON.stringify([...currentPlatforms].sort())) metaData.platforms = metaPlatforms;

            if (metaOpencritic) {
                const val = parseInt(metaOpencritic);
                if (!isNaN(val) && val !== item.game.opencriticScore) metaData.opencriticScore = val;
            }
            if (metaIgdbScore) {
                const val = parseInt(metaIgdbScore);
                if (!isNaN(val) && val !== item.game.igdbScore) metaData.igdbScore = val;
            }
            if (metaSteamScore) {
                const val = parseInt(metaSteamScore);
                if (!isNaN(val) && val !== item.game.steamReviewPercent) metaData.steamReviewPercent = val;
            }
            if (metaFranchise !== item.game.franchise) {
                metaData.franchise = metaFranchise;
            }

            if (backgroundImage !== item.game.backgroundImage) {
                metaData.backgroundImage = backgroundImage;
                if (!coverChanged && !item.customCoverImage && backgroundImage) {
                    try {
                        const colors = await extractColorsAction(backgroundImage);
                        if (colors.primary) {
                            libData.primaryColor = colors.primary;
                            libData.secondaryColor = colors.secondary;
                        }
                    } catch (e) {
                        console.error("Failed to extract colors from background:", e);
                    }
                }
            }

            if (Object.keys(libData).length > 0) promises.push(updateLibraryEntry(item.id, libData));
            if (Object.keys(metaData).length > 0) promises.push(updateGameMetadata(item.gameId, metaData));

            await Promise.all(promises);
            onClose();
        } catch (e) {
            console.error("Failed to save", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Edit {item.game.title}</DialogTitle>
                    <DialogDescription className="sr-only">Edit game details</DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 border-b">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="metadata">Metadata</TabsTrigger>
                            <TabsTrigger value="media">Media</TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1 p-6">

                        {/* --- GENERAL TAB --- */}
                        <TabsContent value="general" className="mt-0 space-y-6">
                            {/* Status & Goal */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select value={status} onValueChange={setStatus}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="WISHLIST">Wishlist</SelectItem>
                                            <SelectItem value="BACKLOG">Backlog</SelectItem>
                                            <SelectItem value="PLAYING">Playing</SelectItem>
                                            <SelectItem value="COMPLETED">Completed</SelectItem>
                                            <SelectItem value="ABANDONED">Abandoned</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Completion Goal</Label>
                                    <Select value={completionType} onValueChange={setCompletionType}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Main">Main Story</SelectItem>
                                            <SelectItem value="Extra">Main + Extra</SelectItem>
                                            <SelectItem value="100%">100% Completion</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Owned Platforms */}
                            <div className="space-y-2">
                                <Label>Owned Platforms</Label>
                                <div className="flex flex-wrap gap-2">
                                    {metaPlatforms.length > 0 ? metaPlatforms.map(p => (
                                        <div key={p} className="flex items-center gap-2 border px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-900/50">
                                            <Checkbox
                                                id={`op-${p}`}
                                                checked={ownedPlatforms.includes(p)}
                                                onCheckedChange={(c) => {
                                                    if (c) setOwnedPlatforms([...ownedPlatforms, p]);
                                                    else setOwnedPlatforms(ownedPlatforms.filter(op => op !== p));
                                                }}
                                            />
                                            <Label htmlFor={`op-${p}`} className="text-xs cursor-pointer">{p}</Label>
                                        </div>
                                    )) : <span className="text-sm text-zinc-500 italic">No platforms data.</span>}
                                </div>
                            </div>

                            {/* Time & Progress */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Playtime (Hours)</Label>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="manual-time" className="text-xs text-muted-foreground">Manual Override</Label>
                                            <Checkbox id="manual-time" checked={useManualTime} onCheckedChange={(c) => setUseManualTime(c === true)} />
                                        </div>
                                    </div>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        value={manualTimeHours}
                                        onChange={(e) => setManualTimeHours(e.target.value)}
                                        disabled={!useManualTime}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Progress (%)</Label>
                                        <div className="flex items-center gap-2">
                                            <Label htmlFor="manual-prog" className="text-xs text-muted-foreground">Manual Override</Label>
                                            <Checkbox id="manual-prog" checked={isManualProgress} onCheckedChange={(c) => setIsManualProgress(c === true)} />
                                        </div>
                                    </div>
                                    <Input
                                        type="number"
                                        min="0" max="100"
                                        value={progressValue}
                                        onChange={(e) => setProgressValue(e.target.value)}
                                        disabled={!isManualProgress}
                                        className={!isManualProgress ? "bg-muted text-muted-foreground opacity-80" : ""}
                                    />
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="space-y-2">
                                <Label>Tags</Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Create new tag..."
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                                    />
                                    <Button variant="outline" size="icon" onClick={handleCreateTag}>
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {availableTags.map(tag => (
                                        <TagBadge
                                            key={tag.id}
                                            tag={tag}
                                            initiallySelected={item.tags?.some(t => t.id === tag.id) || false}
                                            libraryId={item.id}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Completion Times (Crowdsourced) */}
                            <div className="pt-4 border-t space-y-4">
                                <Label className="text-base font-semibold">Completion Times</Label>

                                {/* HLTB Card Visualization */}
                                <HLTBCard
                                    hltbMain={item.game.hltbMain}
                                    hltbExtra={item.game.hltbExtra}
                                    hltbCompletionist={item.game.hltbCompletionist}
                                    usersMain={item.game.usersMain}
                                    usersMainCount={item.game.usersMainCount}
                                    usersExtra={item.game.usersExtra}
                                    usersExtraCount={item.game.usersExtraCount}
                                    usersCompletionist={item.game.usersCompletionist}
                                    usersCompletionistCount={item.game.usersCompletionistCount}
                                    userPlaytime={item.playtimeManual ?? item.playtimeSteam}
                                    predictedMain={item.game.predictedMain}
                                    predictedExtra={item.game.predictedExtra}
                                    predictedCompletionist={item.game.predictedCompletionist}
                                    targetType={completionType}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label className="text-xs text-muted-foreground mb-2 block">My Times (Minutes)</Label>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Label className="w-12 text-xs">Main</Label>
                                                <Input type="number" placeholder="-- min" value={playtimeMain} onChange={(e) => setPlaytimeMain(e.target.value)} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label className="w-12 text-xs">Extra</Label>
                                                <Input type="number" placeholder="-- min" value={playtimeExtra} onChange={(e) => setPlaytimeExtra(e.target.value)} />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Label className="w-12 text-xs">100%</Label>
                                                <Input type="number" placeholder="-- min" value={playtimeCompletionist} onChange={(e) => setPlaytimeCompletionist(e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <Label className="text-xs text-muted-foreground">Admin Overrides (HLTB)</Label>
                                            <Checkbox checked={showFixMatch} onCheckedChange={(c) => setShowFixMatch(c === true)} id="show-admin" />
                                        </div>

                                        {showFixMatch && (
                                            <div className="space-y-2 p-2 border rounded-md bg-zinc-50 dark:bg-zinc-900/50">
                                                <div className="flex items-center gap-2">
                                                    <Label className="w-12 text-xs">Main</Label>
                                                    <Input type="number" step="1" value={hltbMain} onChange={(e) => setHltbMain(Number(e.target.value))} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Label className="w-12 text-xs">Extra</Label>
                                                    <Input type="number" step="1" value={hltbExtra} onChange={(e) => setHltbExtra(Number(e.target.value))} />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Label className="w-12 text-xs">100%</Label>
                                                    <Input type="number" step="1" value={hltbCompletionist} onChange={(e) => setHltbCompletionist(Number(e.target.value))} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* --- METADATA TAB --- */}
                        <TabsContent value="metadata" className="mt-0 space-y-6">

                            {/* Refresh Controls */}
                            <div className="flex items-center justify-between mb-4">
                                <Label className="text-base font-semibold">Game Metadata</Label>
                                <Button size="sm" variant="outline" onClick={() => setIsSearchingMetadata(!isSearchingMetadata)}>
                                    <Search className="h-4 w-4 mr-2" />
                                    {isSearchingMetadata ? "Hide Search" : "Find Metadata"}
                                </Button>
                            </div>

                            {isSearchingMetadata && (
                                <div className="mb-6 p-4 border rounded-md bg-zinc-50 dark:bg-zinc-900/50 space-y-4">
                                    <div className="flex gap-2">
                                        <Input
                                            value={metaSearchQuery}
                                            onChange={(e) => setMetaSearchQuery(e.target.value)}
                                            placeholder="Search game title..."
                                            onKeyDown={(e) => e.key === 'Enter' && handleMetadataSearch()}
                                        />
                                        <Button onClick={handleMetadataSearch} disabled={metaSearchLoading}>
                                            {metaSearchLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                                            Search
                                        </Button>
                                    </div>

                                    {metaCandidates.length > 0 && (
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                            {metaCandidates.map((c) => (
                                                <div key={`${c.source}-${c.id}`} className="border rounded-md bg-background p-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="font-semibold text-sm flex items-center gap-2">
                                                                {c.title}
                                                                <Badge variant="outline" className="text-[10px] h-5">{c.source}</Badge>
                                                            </div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {c.releaseDate ? new Date(c.releaseDate).getFullYear() : 'TBA'}
                                                                {c.studio ? ` • ${c.studio}` : ''}
                                                            </div>
                                                        </div>
                                                        <Button size="sm" variant="ghost" onClick={() => handleMetadataPreview(c)}>
                                                            {metaPreviewId === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </Button>
                                                    </div>

                                                    {metaPreviewId === c.id && (
                                                        <div className="mt-3 pt-3 border-t text-sm space-y-3">
                                                            {metaPreviewLoading ? (
                                                                <div className="flex justify-center py-4"><Loader2 className="animate-spin h-5 w-5" /></div>
                                                            ) : metaPreviewData ? (
                                                                <>
                                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                                        <div><span className="text-muted-foreground">Date:</span> {metaPreviewData.releaseDate ? new Date(metaPreviewData.releaseDate).toISOString().split('T')[0] : '-'}</div>
                                                                        <div><span className="text-muted-foreground">Studio:</span> {metaPreviewData.studio || '-'}</div>
                                                                        <div><span className="text-muted-foreground">Franchise:</span> {metaPreviewData.franchise || '-'}</div>
                                                                        <div>
                                                                            <span className="text-muted-foreground">Scores:</span> IGDB {metaPreviewData.igdbScore || '-'} / Steam {metaPreviewData.steamReviewPercent ? metaPreviewData.steamReviewPercent + '%' : '-'}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-muted-foreground text-xs">Genres:</span>
                                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                                            {metaPreviewData.genres.map(g => <Badge key={g} variant="secondary" className="text-[10px]">{g}</Badge>)}
                                                                        </div>
                                                                    </div>
                                                                    <Button size="sm" className="w-full mt-2" onClick={() => applyMetadata(metaPreviewData)}>
                                                                        Select & Apply
                                                                    </Button>
                                                                </>
                                                            ) : (
                                                                <div className="text-destructive text-xs">Failed to load details.</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Title</Label>
                                    <div className="text-lg font-semibold">{metaTitle}</div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Studio</Label>
                                        <div className="font-medium">{metaStudio || "-"}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Release Date</Label>
                                        <div className="font-medium">{metaReleaseDate || "-"}</div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Genres & Platforms</Label>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {metaGenres.map(g => <Badge key={g} variant="secondary">{g}</Badge>)}
                                        {metaGenres.length > 0 && metaPlatforms.length > 0 && <span className="text-zinc-300">|</span>}
                                        {metaPlatforms.map(p => <Badge key={p} variant="outline">{p}</Badge>)}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Scores</Label>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 p-2 border rounded-md min-w-[100px] justify-center">
                                            <span className="text-xs font-bold text-muted-foreground">OpenCritic</span>
                                            <span className="text-xl font-bold">{metaOpencritic || "-"}</span>
                                        </div>
                                        <div className="flex items-center gap-2 p-2 border rounded-md min-w-[100px] justify-center">
                                            <span className="text-xs font-bold text-muted-foreground">IGDB</span>
                                            <span className="text-xl font-bold">{metaIgdbScore || "-"}</span>
                                        </div>
                                        <div className="flex items-center gap-2 p-2 border rounded-md min-w-[100px] justify-center">
                                            <span className="text-xs font-bold text-muted-foreground">Steam</span>
                                            <span className="text-xl font-bold">{metaSteamScore ? metaSteamScore + '%' : "-"}</span>
                                        </div>
                                    </div>
                                </div>

                                {metaFranchise && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Franchise</Label>
                                        <div className="font-medium">{metaFranchise}</div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        {/* --- MEDIA TAB --- */}
                        <TabsContent value="media" className="mt-0 space-y-6">
                            <div className="space-y-2">
                                <Label>Find Artwork</Label>
                                <div className="flex gap-2 items-center justify-between">
                                    <p className="text-sm text-muted-foreground">
                                        Search for covers and backgrounds from IGDB, RAWG, and Steam.
                                    </p>
                                    <Button onClick={() => {
                                        const title = item.game.title;
                                        setMediaQuery(title);
                                        handleMediaSearch(title);
                                    }} disabled={searchingMedia}>
                                        {searchingMedia && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {searchingMedia ? "Searching..." : "Find Artwork"}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {/* Found Covers Section */}
                                {(searchedCovers.length > 0) && (
                                    <div className="border rounded-md overflow-hidden">
                                        <button
                                            onClick={() => setShowFoundCovers(!showFoundCovers)}
                                            className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Found Covers ({searchedCovers.length})</span>
                                            {showFoundCovers ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>

                                        {showFoundCovers && (
                                            <div className="p-2 bg-background border-t">
                                                 <ScrollArea className={`${showFoundBackgrounds ? 'h-[200px]' : 'h-[350px]'} transition-all`}>
                                                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                                        {searchedCovers.map((src, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => setCoverImage(src)}
                                                                className={`relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary ${coverImage === src ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-transparent hover:border-zinc-300'}`}
                                                            >
                                                                <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 768px) 25vw, 15vw" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Found Backgrounds Section */}
                                {(searchedBackgrounds.length > 0) && (
                                    <div className="border rounded-md overflow-hidden">
                                        <button
                                            onClick={() => setShowFoundBackgrounds(!showFoundBackgrounds)}
                                            className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Found Backgrounds ({searchedBackgrounds.length})</span>
                                            {showFoundBackgrounds ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>

                                        {showFoundBackgrounds && (
                                            <div className="p-2 bg-background border-t">
                                                <ScrollArea className={`${showFoundCovers ? 'h-[160px]' : 'h-[350px]'} transition-all`}>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                        {searchedBackgrounds.map((src, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() => setBackgroundImage(src)}
                                                                className={`relative aspect-video rounded-md overflow-hidden border-2 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary ${backgroundImage === src ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-transparent hover:border-zinc-300'}`}
                                                            >
                                                                <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Current Selection & Manual Input */}
                            <div className="space-y-4 pt-4 border-t">
                                <Label className="text-base font-semibold">Current Selection</Label>

                                <div className="grid sm:grid-cols-2 gap-6">
                                    {/* Cover Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Cover Art</Label>
                                        <div className="aspect-[3/4] relative bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-hidden border shadow-sm w-[140px] mx-auto sm:mx-0">
                                            {coverImage ? (
                                                <Image src={coverImage} alt="Cover" fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-zinc-400 text-xs">No Cover</div>
                                            )}
                                        </div>
                                        <Input
                                            value={coverImage}
                                            onChange={(e) => setCoverImage(e.target.value)}
                                            placeholder="Cover URL"
                                            className="font-mono text-xs h-8"
                                        />
                                    </div>

                                    {/* Background Selection */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Background Art</Label>
                                        <div className="aspect-video relative bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-hidden border shadow-sm">
                                            {backgroundImage ? (
                                                <Image src={backgroundImage} alt="Background" fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-zinc-400 text-xs">No Background</div>
                                            )}
                                        </div>
                                        <Input
                                            value={backgroundImage}
                                            onChange={(e) => setBackgroundImage(e.target.value)}
                                            placeholder="Background URL"
                                            className="font-mono text-xs h-8"
                                        />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </ScrollArea>

                    <DialogFooter className="p-6 pt-2 border-t mt-auto">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
