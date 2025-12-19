'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandEmpty } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

import { updateLibraryEntry, fixGameMatch } from '@/actions/library';
import { assignTag, removeTag, getUserTags, createTag } from '@/actions/tag';
import { searchOnlineGamesAction } from '@/actions/add-game';
import { updateGameMetadata } from '@/actions/game';
import { Game, UserLibrary, Tag } from '@prisma/client';
import { Loader2, Plus, Check, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { EnrichedGameData } from '@/lib/enrichment';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface UpdateData {
  status?: string;
  targetedCompletionType?: string;
  playtimeManual?: number | null;
  progressManual?: number | null;
}

interface EditGameModalProps {
  item: GameWithLibrary;
  isOpen: boolean;
  onClose: () => void;
}

export function EditGameModal({ item, isOpen, onClose }: EditGameModalProps) {
  // --- General Tab State ---
  const [status, setStatus] = useState(item.status);
  const [completionType, setCompletionType] = useState(item.targetedCompletionType || 'Main');

  const initialMinutes = item.playtimeManual !== null ? item.playtimeManual : (item.playtimeSteam || 0);
  const initialHours = Math.round((initialMinutes / 60) * 10) / 10;
  const [useManualTime, setUseManualTime] = useState(item.playtimeManual !== null);
  const [manualTimeHours, setManualTimeHours] = useState(initialHours.toString());

  const [useManualProgress, setUseManualProgress] = useState(item.progressManual !== null);
  const [manualProgress, setManualProgress] = useState(item.progressManual?.toString() || '0');

  const [showFixMatch, setShowFixMatch] = useState(false);
  const hltbTimes = item.game.hltbTimes ? JSON.parse(item.game.hltbTimes) : {};
  const [hltbMain, setHltbMain] = useState(hltbTimes.main || 0);
  const [hltbExtra, setHltbExtra] = useState(hltbTimes.extra || 0);
  const [hltbCompletionist, setHltbCompletionist] = useState(hltbTimes.completionist || 0);

  // --- Metadata Tab State ---
  // Platforms
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [newPlatform, setNewPlatform] = useState('');

  // Scores
  const [metacritic, setMetacritic] = useState<number | null>(item.game.metacritic);
  const [opencritic, setOpencritic] = useState<number | null>(item.game.opencritic);
  const [displaySource, setDisplaySource] = useState<'metacritic' | 'opencritic'>('metacritic');

  // --- Media Tab State ---
  const [currentCover, setCurrentCover] = useState(item.game.coverImage || '');
  const [currentBackground, setCurrentBackground] = useState(item.game.backgroundImage || '');
  const [isSearchingMedia, setIsSearchingMedia] = useState(false);
  const [mediaSearchResults, setMediaSearchResults] = useState<EnrichedGameData[]>([]);
  const [selectedMediaGame, setSelectedMediaGame] = useState<EnrichedGameData | null>(null);

  // --- Tags Tab State ---
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Tag[]>(item.tags || []);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getUserTags().then(setAvailableTags);

      // Reset General
      setStatus(item.status);
      setCompletionType(item.targetedCompletionType || 'Main');
      const minutes = item.playtimeManual !== null ? item.playtimeManual : (item.playtimeSteam || 0);
      setUseManualTime(item.playtimeManual !== null);
      setManualTimeHours((Math.round((minutes / 60) * 10) / 10).toString());
      setUseManualProgress(item.progressManual !== null);
      setManualProgress(item.progressManual?.toString() || '0');

      // Reset Tags
      setSelectedTags(item.tags || []);

      // Reset Metadata
      try {
          const parsedPlatforms = item.game.platforms ? JSON.parse(item.game.platforms) : [];
          setPlatforms(parsedPlatforms);
      } catch {
          setPlatforms([]);
      }
      setMetacritic(item.game.metacritic);
      setOpencritic(item.game.opencritic);
      // Determine default display source logic (if one is null, pick the other, usually default to metacritic if both exist)
      // Note: We don't have a 'preferredSource' in DB, so we just let user toggle.
      // If we save, we might overwrite 'metacritic' field if we want to force display, but here we edit both values independently.
      // Wait, the prompt implies "choose what to display". GameCard shows 'metacritic'.
      // So if 'opencritic' is chosen, we should probably swap the value into 'metacritic' OR logic in GameCard should be changed.
      // But GameCard logic is complex.
      // Strategy: We will update the actual `metacritic` column with the value chosen to be displayed.
      // AND we keep the `opencritic` column correct.

      // Reset Media
      setCurrentCover(item.game.coverImage || '');
      setCurrentBackground(item.game.backgroundImage || '');
      setMediaSearchResults([]);
      setSelectedMediaGame(null);
    }
  }, [isOpen, item]);

  const handleCreateTag = async (name: string) => {
      const res = await createTag(name);
      if (res.success && res.tag) {
          setAvailableTags(prev => [...prev, res.tag!]);
          await handleToggleTag(res.tag);
          setTagSearch('');
      }
  };

  const handleToggleTag = async (tag: Tag) => {
      const isSelected = selectedTags.some(t => t.id === tag.id);
      if (isSelected) {
          await removeTag(item.id, tag.id);
          setSelectedTags(prev => prev.filter(t => t.id !== tag.id));
      } else {
          await assignTag(item.id, tag.id);
          setSelectedTags(prev => [...prev, tag]);
      }
  };

  const handleSearchMedia = async () => {
      setIsSearchingMedia(true);
      try {
          // Search using the game title
          const results = await searchOnlineGamesAction(item.game.title);
          // Filter to remove duplicates if needed, but usually fine
          setMediaSearchResults(results);
      } catch (e) {
          console.error(e);
      } finally {
          setIsSearchingMedia(false);
      }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const promises = [];

      // 1. Update Library Entry (General Tab)
      const dataToUpdate: UpdateData = {};
      if (status !== item.status) dataToUpdate.status = status;
      if (completionType !== item.targetedCompletionType) dataToUpdate.targetedCompletionType = completionType;

      if (useManualTime) {
          const hoursVal = parseFloat(manualTimeHours);
          if (!isNaN(hoursVal)) dataToUpdate.playtimeManual = Math.round(hoursVal * 60);
      } else if (item.playtimeManual !== null) {
          dataToUpdate.playtimeManual = null;
      }

      if (useManualProgress) {
          const progressVal = parseInt(manualProgress);
          if (!isNaN(progressVal)) dataToUpdate.progressManual = Math.min(100, Math.max(0, progressVal));
      } else if (item.progressManual !== null) {
          dataToUpdate.progressManual = null;
      }

      if (Object.keys(dataToUpdate).length > 0) {
          promises.push(updateLibraryEntry(item.id, dataToUpdate));
      }

      // 2. Fix Match (General Tab)
      if (showFixMatch) {
          promises.push(fixGameMatch(item.gameId, {
              main: parseFloat(hltbMain.toString()),
              extra: parseFloat(hltbExtra.toString()),
              completionist: parseFloat(hltbCompletionist.toString())
          }));
      }

      // 3. Update Game Metadata (Metadata & Media Tabs)
      // Determine what to save for "metacritic" (Display Score)
      // If user selected OpenCritic as display source, we set 'metacritic' column to that value?
      // Or do we just update the columns faithfully?
      // The GameCard displays `metacritic`. So if user wants to "Show OpenCritic", we effectively must put the OpenCritic score into the `metacritic` field
      // OR update GameCard to read a preference.
      // Simpler approach for now: We update the values.
      // But if the user toggles "Display OpenCritic", we should probably swap them?
      // No, that's destructive.
      // Let's assume the user just edits the values. The "Display Source" toggle in the UI will help populate the `metacritic` field
      // with the chosen value, but we still save the real OpenCritic score to `opencritic` if known.

      let finalMetacritic = metacritic;
      if (displaySource === 'opencritic') {
          finalMetacritic = opencritic;
      }

      interface MetadataUpdate {
        platforms?: string[];
        coverImage?: string;
        backgroundImage?: string;
        metacritic?: number | null;
        opencritic?: number | null;
      }

      const metadataUpdate: MetadataUpdate = {};
      // Always update platforms if changed
      if (JSON.stringify(platforms) !== item.game.platforms) {
          metadataUpdate.platforms = platforms;
      }

      // Update media if changed
      if (currentCover !== item.game.coverImage) metadataUpdate.coverImage = currentCover;
      if (currentBackground !== item.game.backgroundImage) metadataUpdate.backgroundImage = currentBackground;

      // Update scores
      // We assume `metacritic` field is the "Primary/Display" score.
      if (finalMetacritic !== item.game.metacritic) metadataUpdate.metacritic = finalMetacritic;
      if (opencritic !== item.game.opencritic) metadataUpdate.opencritic = opencritic;

      if (Object.keys(metadataUpdate).length > 0) {
          promises.push(updateGameMetadata(item.game.id, metadataUpdate));
      }

      await Promise.all(promises);
      onClose();
    } catch (error) {
      console.error("Failed to update game", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Edit {item.game.title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-2 shrink-0">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="metadata">Metadata</TabsTrigger>
                    <TabsTrigger value="media">Media</TabsTrigger>
                    <TabsTrigger value="tags">Tags</TabsTrigger>
                </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* --- GENERAL TAB --- */}
                <TabsContent value="general" className="space-y-6 mt-0">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="status" className="text-right">Status</Label>
                        <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Wishlist">Wishlist</SelectItem>
                            <SelectItem value="Backlog">Backlog</SelectItem>
                            <SelectItem value="Up Next">Up Next</SelectItem>
                            <SelectItem value="Playing">Playing</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Abandoned">Abandoned</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="completion" className="text-right">Goal</Label>
                        <Select value={completionType} onValueChange={setCompletionType}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select goal" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Main">Main Story</SelectItem>
                            <SelectItem value="Extra">Main + Extra</SelectItem>
                            <SelectItem value="100%">100% Completion</SelectItem>
                        </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="time" className="text-right">Time (hours)</Label>
                        <div className="col-span-3 flex items-center gap-2">
                            <Checkbox
                                id="manual-time-check"
                                checked={useManualTime}
                                onCheckedChange={(c) => setUseManualTime(c === true)}
                            />
                            <Label htmlFor="manual-time-check" className="text-xs text-muted-foreground mr-2">Manual</Label>
                            <Input
                                id="time"
                                type="number"
                                step="0.1"
                                value={manualTimeHours}
                                onChange={(e) => setManualTimeHours(e.target.value)}
                                disabled={!useManualTime}
                                className="flex-1"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="progress" className="text-right">Progress (%)</Label>
                        <div className="col-span-3 flex items-center gap-2">
                            <Checkbox
                                id="manual-progress-check"
                                checked={useManualProgress}
                                onCheckedChange={(c) => setUseManualProgress(c === true)}
                            />
                            <Label htmlFor="manual-progress-check" className="text-xs text-muted-foreground mr-2">Manual</Label>
                            <Input
                                id="progress"
                                type="number"
                                min="0"
                                max="100"
                                value={manualProgress}
                                onChange={(e) => setManualProgress(e.target.value)}
                                disabled={!useManualProgress}
                                className="flex-1"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-4">
                             <Label>HLTB Data Override</Label>
                             <Button variant="ghost" size="sm" onClick={() => setShowFixMatch(!showFixMatch)}>
                                {showFixMatch ? "Hide" : "Edit"}
                            </Button>
                        </div>
                        {showFixMatch && (
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <Label className="text-xs">Main</Label>
                                    <Input type="number" step="0.1" value={hltbMain} onChange={(e) => setHltbMain(Number(e.target.value))} />
                                </div>
                                <div>
                                    <Label className="text-xs">Extra</Label>
                                    <Input type="number" step="0.1" value={hltbExtra} onChange={(e) => setHltbExtra(Number(e.target.value))} />
                                </div>
                                <div>
                                    <Label className="text-xs">100%</Label>
                                    <Input type="number" step="0.1" value={hltbCompletionist} onChange={(e) => setHltbCompletionist(Number(e.target.value))} />
                                </div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* --- METADATA TAB --- */}
                <TabsContent value="metadata" className="space-y-6 mt-0">
                    <div className="space-y-3">
                        <Label>Platforms</Label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {platforms.map((p, i) => (
                                <Badge key={i} variant="secondary" className="cursor-pointer hover:bg-destructive/20 hover:text-destructive" onClick={() => setPlatforms(platforms.filter((_, idx) => idx !== i))}>
                                    {p} <span className="ml-1 text-muted-foreground">×</span>
                                </Badge>
                            ))}
                             {platforms.length === 0 && <span className="text-sm text-muted-foreground italic">No platforms listed</span>}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add platform (e.g. PC, PS5)..."
                                value={newPlatform}
                                onChange={(e) => setNewPlatform(e.target.value)}
                                onKeyDown={(e) => {
                                    if(e.key === 'Enter' && newPlatform.trim()) {
                                        setPlatforms([...platforms, newPlatform.trim()]);
                                        setNewPlatform('');
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    if(newPlatform.trim()) {
                                        setPlatforms([...platforms, newPlatform.trim()]);
                                        setNewPlatform('');
                                    }
                                }}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t">
                        <Label className="text-base font-semibold">Scores</Label>
                        <p className="text-xs text-muted-foreground mb-4">
                            Choose which score to display on the card. This will update the primary score field.
                        </p>

                        <RadioGroup value={displaySource} onValueChange={(v) => setDisplaySource(v as 'metacritic' | 'opencritic')} className="grid grid-cols-2 gap-4">
                            <div>
                                <RadioGroupItem value="metacritic" id="meta-edit" className="peer sr-only" />
                                <Label
                                    htmlFor="meta-edit"
                                    className="flex flex-col gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer transition-all"
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="font-bold">Metacritic</span>
                                        {displaySource === 'metacritic' && <Check className="h-4 w-4 text-primary" />}
                                    </div>
                                    <Input
                                        type="number"
                                        value={metacritic || ''}
                                        onChange={(e) => setMetacritic(e.target.value ? Number(e.target.value) : null)}
                                        className="h-8 w-full mt-2"
                                        placeholder="Score"
                                    />
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="opencritic" id="open-edit" className="peer sr-only" />
                                <Label
                                    htmlFor="open-edit"
                                    className="flex flex-col gap-2 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer transition-all"
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="font-bold">OpenCritic</span>
                                        {displaySource === 'opencritic' && <Check className="h-4 w-4 text-primary" />}
                                    </div>
                                    <Input
                                        type="number"
                                        value={opencritic || ''}
                                        onChange={(e) => setOpencritic(e.target.value ? Number(e.target.value) : null)}
                                        className="h-8 w-full mt-2"
                                        placeholder="Score"
                                    />
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>
                </TabsContent>

                {/* --- MEDIA TAB --- */}
                <TabsContent value="media" className="space-y-6 mt-0">
                    <div className="space-y-4">
                        <div className="flex gap-2">
                             <Button
                                variant="secondary"
                                className="w-full"
                                onClick={handleSearchMedia}
                                disabled={isSearchingMedia}
                             >
                                {isSearchingMedia ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                                Search Images for &quot;{item.game.title}&quot;
                             </Button>
                        </div>

                        {mediaSearchResults.length > 0 && (
                            <div className="p-4 border rounded-md bg-muted/20">
                                <Label className="mb-2 block">Search Results</Label>
                                <ScrollArea className="h-[120px]">
                                    <div className="flex gap-2 pb-2">
                                        {mediaSearchResults.map((res) => (
                                            <button
                                                key={res.id}
                                                onClick={() => setSelectedMediaGame(res)}
                                                className={cn(
                                                    "relative w-[80px] h-[120px] shrink-0 rounded overflow-hidden border-2 transition-all",
                                                    selectedMediaGame?.id === res.id ? "border-primary ring-2 ring-primary/20" : "border-transparent opacity-70 hover:opacity-100"
                                                )}
                                            >
                                                {res.availableCovers[0] ? (
                                                     <Image src={res.availableCovers[0]} alt={res.title} fill className="object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-800" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {/* Selected Result Media Picker */}
                        {selectedMediaGame && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                <Label className="text-primary font-semibold">Found Images for: {selectedMediaGame.title}</Label>

                                {/* Cover Picker */}
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Pick a Cover</Label>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {selectedMediaGame.availableCovers.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setCurrentCover(url)}
                                                className={cn(
                                                    "relative w-[60px] h-[90px] shrink-0 rounded overflow-hidden border-2",
                                                    currentCover === url ? "border-primary" : "border-transparent"
                                                )}
                                            >
                                                <Image src={url} alt="Cover" fill className="object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Background Picker */}
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Pick a Background</Label>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {selectedMediaGame.availableBackgrounds.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setCurrentBackground(url)}
                                                className={cn(
                                                    "relative w-[120px] h-[68px] shrink-0 rounded overflow-hidden border-2",
                                                    currentBackground === url ? "border-primary" : "border-transparent"
                                                )}
                                            >
                                                <Image src={url} alt="Bg" fill className="object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4 pt-4 border-t">
                            <Label>Manual URLs</Label>
                            <div className="grid gap-2">
                                <Label className="text-xs text-muted-foreground">Cover Image URL</Label>
                                <div className="flex gap-2">
                                    <Input value={currentCover} onChange={(e) => setCurrentCover(e.target.value)} className="flex-1" />
                                    <div className="w-10 h-14 relative bg-muted rounded shrink-0 overflow-hidden border">
                                        {currentCover && <Image src={currentCover} alt="Preview" fill className="object-cover" />}
                                    </div>
                                </div>
                            </div>
                             <div className="grid gap-2">
                                <Label className="text-xs text-muted-foreground">Background Image URL</Label>
                                <div className="flex gap-2">
                                    <Input value={currentBackground} onChange={(e) => setCurrentBackground(e.target.value)} className="flex-1" />
                                    <div className="w-20 h-12 relative bg-muted rounded shrink-0 overflow-hidden border">
                                        {currentBackground && <Image src={currentBackground} alt="Preview" fill className="object-cover" />}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                {/* --- TAGS TAB --- */}
                <TabsContent value="tags" className="space-y-6 mt-0">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <Label>Manage Tags</Label>
                            <Popover open={tagOpen} onOpenChange={setTagOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={tagOpen}
                                        className="justify-between"
                                    >
                                        {selectedTags.length > 0
                                            ? `${selectedTags.length} tags selected`
                                            : "Select or create tags..."}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start">
                                    <Command>
                                        <CommandInput
                                            placeholder="Search tag..."
                                            value={tagSearch}
                                            onValueChange={setTagSearch}
                                        />
                                        <CommandList>
                                            <CommandEmpty>
                                                <button
                                                    className="flex items-center gap-2 p-2 text-sm text-primary w-full hover:bg-muted"
                                                    onClick={() => handleCreateTag(tagSearch)}
                                                >
                                                    <Plus className="h-4 w-4" /> Create &quot;{tagSearch}&quot;
                                                </button>
                                            </CommandEmpty>
                                            <CommandGroup heading="Available Tags">
                                                {availableTags.map((tag) => {
                                                    const isSelected = selectedTags.some(t => t.id === tag.id);
                                                    return (
                                                        <CommandItem
                                                            key={tag.id}
                                                            value={tag.name}
                                                            onSelect={() => handleToggleTag(tag)}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    isSelected ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            {tag.name}
                                                        </CommandItem>
                                                    );
                                                })}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-wrap gap-2">
                             {selectedTags.map(tag => (
                                 <Badge key={tag.id} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1">
                                     {tag.name}
                                     <button onClick={() => handleToggleTag(tag)} className="hover:bg-destructive/20 hover:text-destructive rounded-full p-0.5">
                                         <Plus className="h-3 w-3 rotate-45" />
                                     </button>
                                 </Badge>
                             ))}
                             {selectedTags.length === 0 && (
                                 <span className="text-sm text-muted-foreground italic">No tags assigned.</span>
                             )}
                        </div>
                    </div>
                </TabsContent>
            </div>

            <DialogFooter className="px-6 py-4 border-t shrink-0">
                <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
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
