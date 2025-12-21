'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { updateLibraryEntry, fixGameMatch } from '@/actions/library';
import { updateGameMetadata, searchGameImages } from '@/actions/game';
import { assignTag, removeTag, getUserTags, createTag } from '@/actions/tag';
import { Game, UserLibrary, Tag } from '@prisma/client';
import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Image from 'next/image';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface EditGameModalProps {
  item: GameWithLibrary;
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
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                isSelected
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

  // Time
  const initialMinutes = item.playtimeManual !== null ? item.playtimeManual : (item.playtimeSteam || 0);
  const initialHours = Math.round((initialMinutes / 60) * 10) / 10;
  const [useManualTime, setUseManualTime] = useState(item.playtimeManual !== null);
  const [manualTimeHours, setManualTimeHours] = useState(initialHours.toString());

  // Progress
  const [useManualProgress, setUseManualProgress] = useState(item.progressManual !== null);
  const [manualProgress, setManualProgress] = useState(item.progressManual?.toString() || '0');

  // Fix Match (HLTB)
  const hltbTimes = item.game.hltbTimes ? JSON.parse(item.game.hltbTimes) : {};
  const [showFixMatch, setShowFixMatch] = useState(false);
  const [hltbMain, setHltbMain] = useState(hltbTimes.main || 0);
  const [hltbExtra, setHltbExtra] = useState(hltbTimes.extra || 0);
  const [hltbCompletionist, setHltbCompletionist] = useState(hltbTimes.completionist || 0);

  // Tags
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");

  // --- METADATA TAB STATE ---
  const [title, setTitle] = useState(item.game.title);
  const [studio, setStudio] = useState(item.game.studio || "");
  const [releaseDate, setReleaseDate] = useState(item.game.releaseDate ? new Date(item.game.releaseDate).toISOString().split('T')[0] : "");
  const [genres, setGenres] = useState<string[]>(item.game.genres ? JSON.parse(item.game.genres) : []);

  // Handle platforms: Json type (Array of strings or objects)
  const [platforms, setPlatforms] = useState<string[]>(() => {
      const p = item.game.platforms;
      if (Array.isArray(p)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return p.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean);
      }
      return [];
  });

  const [metacritic, setMetacritic] = useState(item.game.metacritic?.toString() || "");
  const [opencritic, setOpencritic] = useState(item.game.opencritic?.toString() || "");

  const [newGenre, setNewGenre] = useState("");
  const [newPlatform, setNewPlatform] = useState("");

  // --- MEDIA TAB STATE ---
  const [coverImage, setCoverImage] = useState(item.customCoverImage || item.game.coverImage || "");
  const [backgroundImage, setBackgroundImage] = useState(item.game.backgroundImage || "");
  const [mediaQuery, setMediaQuery] = useState("");
  const [searchedCovers, setSearchedCovers] = useState<string[]>([]);
  const [searchedBackgrounds, setSearchedBackgrounds] = useState<string[]>([]);
  const [searchingMedia, setSearchingMedia] = useState(false);


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

      // Reset Metadata
      setTitle(item.game.title);
      setStudio(item.game.studio || "");
      setReleaseDate(item.game.releaseDate ? new Date(item.game.releaseDate).toISOString().split('T')[0] : "");
      setGenres(item.game.genres ? JSON.parse(item.game.genres) : []);

      if (Array.isArray(item.game.platforms)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setPlatforms(item.game.platforms.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean));
      } else {
          setPlatforms([]);
      }

      setMetacritic(item.game.metacritic?.toString() || "");
      setOpencritic(item.game.opencritic?.toString() || "");

      // Reset Media
      setCoverImage(item.customCoverImage || item.game.coverImage || "");
      setBackgroundImage(item.game.backgroundImage || "");
      setSearchedCovers([]);
      setSearchedBackgrounds([]);
      setMediaQuery("");
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
      // Pass IGDB ID if available to ensure accurate results
      // Pass Release Year to strict filter
      const releaseYear = item.game.releaseDate ? new Date(item.game.releaseDate).getFullYear() : undefined;

      const { covers, backgrounds } = await searchGameImages(query, {
          igdbId: item.game.igdbId || undefined,
          releaseYear: releaseYear
      });
      setSearchedCovers(covers);
      setSearchedBackgrounds(backgrounds);
      setSearchingMedia(false);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // 1. Update Library Entry (General Tab)
      const libData: Partial<Parameters<typeof updateLibraryEntry>[1]> = {};
      if (status !== item.status) libData.status = status;
      if (completionType !== item.targetedCompletionType) libData.targetedCompletionType = completionType;

      if (useManualTime) {
          const m = parseFloat(manualTimeHours);
          if (!isNaN(m)) libData.playtimeManual = Math.round(m * 60);
      } else {
          libData.playtimeManual = null;
      }

      if (useManualProgress) {
          const p = parseInt(manualProgress);
          if (!isNaN(p)) libData.progressManual = Math.min(100, Math.max(0, p));
      } else {
          libData.progressManual = null;
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

      // Update Custom Cover Image on Library Entry
      // Calculate the effective current cover (user custom or global default)
      const currentEffectiveCover = item.customCoverImage || item.game.coverImage || "";
      const globalCover = item.game.coverImage || "";

      // Only include in payload if the image actually changed from what is currently displayed/stored
      if (coverImage !== currentEffectiveCover) {
           if (coverImage === globalCover) {
               // User changed back to the global default -> Reset custom field to null
               libData.customCoverImage = null;
           } else {
               // User selected a new custom image
               libData.customCoverImage = coverImage;
           }
      }

      // 2. Update Game Metadata (Metadata & Media Tabs)
      const metaData: Parameters<typeof updateGameMetadata>[1] = {};
      if (title !== item.game.title) metaData.title = title;
      if (studio !== item.game.studio) metaData.studio = studio;
      if (releaseDate) metaData.releaseDate = new Date(releaseDate);

      // Compare arrays
      const currentGenres = item.game.genres ? JSON.parse(item.game.genres) : [];
      if (JSON.stringify([...genres].sort()) !== JSON.stringify([...currentGenres].sort())) metaData.genres = genres;

      const currentPlatformsRaw = item.game.platforms;
      const currentPlatforms = Array.isArray(currentPlatformsRaw)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? currentPlatformsRaw.map((x: any) => typeof x === 'string' ? x : x?.name || '').filter(Boolean)
        : [];
      if (JSON.stringify([...platforms].sort()) !== JSON.stringify([...currentPlatforms].sort())) metaData.platforms = platforms;

      // Handle Scores (allow clearing)
      if (metacritic === "") {
         if (item.game.metacritic !== null) metaData.metacritic = null;
      } else {
         const metaVal = parseInt(metacritic);
         if (!isNaN(metaVal) && metaVal !== item.game.metacritic) metaData.metacritic = metaVal;
      }

      if (opencritic === "") {
          if (item.game.opencritic !== null) metaData.opencritic = null;
      } else {
          const openVal = parseInt(opencritic);
          if (!isNaN(openVal) && openVal !== item.game.opencritic) metaData.opencritic = openVal;
      }

      // Handle Release Date (allow clearing)
      if (releaseDate === "") {
          if (item.game.releaseDate !== null) metaData.releaseDate = null;
      } else {
          const dateVal = new Date(releaseDate);
          if (dateVal.getTime() !== (item.game.releaseDate ? new Date(item.game.releaseDate).getTime() : 0)) {
              metaData.releaseDate = dateVal;
          }
      }

      // We no longer update the global game cover from here, we use customCoverImage on UserLibrary
      // if (coverImage !== item.game.coverImage) metaData.coverImage = coverImage;
      if (backgroundImage !== item.game.backgroundImage) metaData.backgroundImage = backgroundImage;

      if (Object.keys(metaData).length > 0) {
          promises.push(updateGameMetadata(item.gameId, metaData));
      }

      await Promise.all(promises);
      onClose();
    } catch (e) {
        console.error("Failed to save", e);
    } finally {
        setLoading(false);
    }
  };

  const addItem = (list: string[], setList: (l: string[]) => void, val: string, setVal: (v: string) => void) => {
      if (val.trim() && !list.includes(val.trim())) {
          setList([...list, val.trim()]);
          setVal("");
      }
  };

  const removeItem = (list: string[], setList: (l: string[]) => void, val: string) => {
      setList(list.filter(i => i !== val));
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
                                    <SelectItem value="Wishlist">Wishlist</SelectItem>
                                    <SelectItem value="Backlog">Backlog</SelectItem>
                                    <SelectItem value="Up Next">Up Next</SelectItem>
                                    <SelectItem value="Playing">Playing</SelectItem>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="Abandoned">Abandoned</SelectItem>
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
                                    <Checkbox id="manual-prog" checked={useManualProgress} onCheckedChange={(c) => setUseManualProgress(c === true)} />
                                </div>
                            </div>
                            <Input
                                type="number"
                                min="0" max="100"
                                value={manualProgress}
                                onChange={(e) => setManualProgress(e.target.value)}
                                disabled={!useManualProgress}
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

                    {/* Fix Match */}
                    <div className="pt-4 border-t">
                        <Button variant="ghost" size="sm" onClick={() => setShowFixMatch(!showFixMatch)} className="w-full">
                            {showFixMatch ? "Hide HLTB Data" : "Edit HLTB Data (Fix Match)"}
                        </Button>
                        {showFixMatch && (
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <div><Label className="text-xs">Main</Label><Input type="number" step="0.1" value={hltbMain} onChange={(e) => setHltbMain(Number(e.target.value))} /></div>
                                <div><Label className="text-xs">Extra</Label><Input type="number" step="0.1" value={hltbExtra} onChange={(e) => setHltbExtra(Number(e.target.value))} /></div>
                                <div><Label className="text-xs">100%</Label><Input type="number" step="0.1" value={hltbCompletionist} onChange={(e) => setHltbCompletionist(Number(e.target.value))} /></div>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* --- METADATA TAB --- */}
                <TabsContent value="metadata" className="mt-0 space-y-6">
                    <div className="space-y-2">
                        <Label>Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Studio</Label>
                            <Input value={studio} onChange={(e) => setStudio(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Release Date</Label>
                            <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Genres</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add genre..."
                                value={newGenre}
                                onChange={(e) => setNewGenre(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addItem(genres, setGenres, newGenre, setNewGenre)}
                            />
                            <Button size="icon" variant="outline" onClick={() => addItem(genres, setGenres, newGenre, setNewGenre)}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {genres.map(g => (
                                <span key={g} className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-xs flex items-center gap-1">
                                    {g} <button onClick={() => removeItem(genres, setGenres, g)}><X className="h-3 w-3" /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Platforms</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Add platform..."
                                value={newPlatform}
                                onChange={(e) => setNewPlatform(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addItem(platforms, setPlatforms, newPlatform, setNewPlatform)}
                            />
                            <Button size="icon" variant="outline" onClick={() => addItem(platforms, setPlatforms, newPlatform, setNewPlatform)}><Plus className="h-4 w-4" /></Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {platforms.map(p => (
                                <span key={p} className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md text-xs flex items-center gap-1">
                                    {p} <button onClick={() => removeItem(platforms, setPlatforms, p)}><X className="h-3 w-3" /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label>Metacritic Score</Label>
                            <Input type="number" value={metacritic} onChange={(e) => setMetacritic(e.target.value)} />
                         </div>
                         <div className="space-y-2">
                            <Label>OpenCritic Score</Label>
                            <Input type="number" value={opencritic} onChange={(e) => setOpencritic(e.target.value)} />
                         </div>
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

                    <div className="space-y-6">

                        {/* Search Results Area */}
                        {(searchedCovers.length > 0 || searchedBackgrounds.length > 0) && (
                            <div className="space-y-4 border rounded-md p-4 bg-zinc-50 dark:bg-zinc-900/50">
                                {searchedCovers.length > 0 && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Found Covers</Label>
                                        <ScrollArea className="h-[240px] border rounded-md bg-background p-2">
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

                                {searchedBackgrounds.length > 0 && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Found Backgrounds</Label>
                                        <ScrollArea className="h-[200px] border rounded-md bg-background p-2">
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
