'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ChevronRight, Check, ArrowLeft, X } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
// CORRECTION ICI : Utilisation des bons noms de fonctions
import { addGameExtended, searchLocalGamesAction, searchOnlineGamesAction, fetchOpenCriticAction } from '@/actions/add-game';
import { searchGameImages } from '@/actions/game';
import { EnrichedGameData } from '@/lib/enrichment';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AddGameWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddGameWizardDialog({ isOpen, onClose }: AddGameWizardDialogProps) {
  const [step, setStep] = useState<'search' | 'customize'>('search');
  const [mobileTab, setMobileTab] = useState<'art' | 'details'>('art');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loadingGameId, setLoadingGameId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<EnrichedGameData[]>([]);
  const [hasSearchedOnline, setHasSearchedOnline] = useState(false);

  // Form State
  const [selectedGame, setSelectedGame] = useState<EnrichedGameData | null>(null);
  const [title, setTitle] = useState('');
  const [studio, setStudio] = useState('');
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(0);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState('');

  // Genre handling & Platforms
  const [genres, setGenres] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [newGenre, setNewGenre] = useState('');

  // Scores
  const [fetchedOpenCritic, setFetchedOpenCritic] = useState<number | null>(null);
  const [fetchedOpenCriticUrl, setFetchedOpenCriticUrl] = useState<string | null>(null);

  // Status & Goal
  const [status, setStatus] = useState<string>('BACKLOG');
  const [completionTarget, setCompletionTarget] = useState<string>('MAIN');

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearchedOnline(false);
    try {
        const results = await searchLocalGamesAction(searchQuery);
        const formattedResults: EnrichedGameData[] = results.map(r => ({
             ...r,
             genres: r.genres || [],
             originalData: null,
             description: r.description || '',
             source: 'local'
        }));
        setSearchResults(formattedResults);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSearching(false);
    }
  }, [searchQuery]);

  // Debounce search effect
  useEffect(() => {
    if (step !== 'search' || !isOpen) return;

    const timer = setTimeout(() => {
        if (searchQuery.trim().length >= 2) {
            handleSearch();
        } else {
            setSearchResults([]);
        }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, step, handleSearch]);

  useEffect(() => {
    if (!isOpen) {
        const timer = setTimeout(() => {
            setStep('search');
            setSearchQuery('');
            setSearchResults([]);
            setHasSearchedOnline(false);
            setSelectedGame(null);
            setCustomCoverUrl('');
            setCustomBackgroundUrl('');
            setLoadingGameId(null);
            setStatus('BACKLOG');
            setCompletionTarget('MAIN');
            setMobileTab('art');
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleExtendSearch = async () => {
    setIsSearching(true);
    try {
        const onlineResults = await searchOnlineGamesAction(searchQuery);
        const formattedOnlineResults: EnrichedGameData[] = onlineResults.map(r => ({
            ...r,
            originalData: r.originalData || null,
            availableBackgrounds: r.availableBackgrounds || [],
            platforms: r.platforms || [],
            description: r.description || ''
        }));

        setSearchResults(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newResults = formattedOnlineResults.filter(r => !existingIds.has(r.id));
            return [...prev, ...newResults];
        });
        setHasSearchedOnline(true);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSearching(false);
    }
  };

  const selectGame = async (game: EnrichedGameData) => {
    // Start loading state for this specific game
    setLoadingGameId(game.id);

    try {
        // 1. Fetch OpenCritic if not present
        let score = game.opencriticScore;
        let url = game.opencriticUrl;

        // Only fetch if game is already released (has date and date <= today)
        const isReleased = game.releaseDate && new Date(game.releaseDate) <= new Date();

        if (!score && game.source !== 'manual' && isReleased) {
            try {
                const ocResult = await fetchOpenCriticAction(game.title);
                if (ocResult) {
                    if (ocResult.score) score = ocResult.score;
                    if (ocResult.url) url = ocResult.url;
                }
            } catch (e) {
                console.error("Failed to fetch OpenCritic score:", e);
            }
        }

        // 2. Fetch Comprehensive Art (Steam, IGDB, RAWG)
        // We do this to ensure we have the best options, specifically Steam Library assets
        const mergedCovers = [...(game.availableCovers || [])];
        const mergedBackgrounds = [...(game.availableBackgrounds || [])];

        if (game.source !== 'manual') {
            try {
                const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : undefined;
                const images = await searchGameImages(game.title, {
                    igdbId: game.source === 'igdb' ? game.id : undefined,
                    releaseYear
                });

                // Merge unique images
                const existingCoverSet = new Set(mergedCovers);
                images.covers.forEach(c => {
                    if (!existingCoverSet.has(c)) {
                        mergedCovers.push(c);
                        existingCoverSet.add(c);
                    }
                });

                const existingBgSet = new Set(mergedBackgrounds);
                images.backgrounds.forEach(b => {
                    if (!existingBgSet.has(b)) {
                        mergedBackgrounds.push(b);
                        existingBgSet.add(b);
                    }
                });
            } catch (e) {
                console.error("Failed to fetch extra game images:", e);
            }
        }

        // 3. Determine Default Selections (Priority: Steam Library)
        let defaultCoverIndex = 0;
        let defaultBgIndex = 0;

        // Find Steam Library Cover (library_600x900)
        const steamCoverIdx = mergedCovers.findIndex(c => c.includes('library_600x900'));
        if (steamCoverIdx !== -1) defaultCoverIndex = steamCoverIdx;

        // Find Steam Library Hero (library_hero)
        const steamBgIdx = mergedBackgrounds.findIndex(b => b.includes('library_hero'));
        if (steamBgIdx !== -1) defaultBgIndex = steamBgIdx;


        // 4. Update State
        setSelectedGame({
            ...game,
            availableCovers: mergedCovers,
            availableBackgrounds: mergedBackgrounds
        });

        setTitle(game.title);
        setStudio(game.studio || '');
        setGenres(game.genres || []);

        const initialPlatforms = game.platforms || [];
        setPlatforms(initialPlatforms);
        setAvailablePlatforms(initialPlatforms);

        setSelectedCoverIndex(defaultCoverIndex);
        setSelectedBackgroundIndex(defaultBgIndex);
        setCustomCoverUrl('');
        setCustomBackgroundUrl('');

        // Default to WISHLIST for TBA/Future, BACKLOG for Released
        let defaultStatus = 'WISHLIST';
        if (game.releaseDate) {
            const rDate = new Date(game.releaseDate);
            const today = new Date();
            if (!isNaN(rDate.getTime()) && rDate <= today) {
                defaultStatus = 'BACKLOG';
            }
        }
        setStatus(defaultStatus);
        setCompletionTarget('MAIN');

        setFetchedOpenCritic(score || null);
        setFetchedOpenCriticUrl(url || null);

        setStep('customize');
        setMobileTab('art');
    } finally {
        setLoadingGameId(null);
    }
  };

  const togglePlatform = (p: string) => {
    setPlatforms(prev =>
        prev.includes(p) ? prev.filter(item => item !== p) : [...prev, p]
    );
  };

  const handleFinalSubmit = async () => {
    if (!selectedGame) return;
    const coverImage = customCoverUrl || (selectedGame.availableCovers.length > 0 ? selectedGame.availableCovers[selectedCoverIndex] : '') || '';
    const backgroundImage = customBackgroundUrl || (selectedGame.availableBackgrounds.length > 0 ? selectedGame.availableBackgrounds[selectedBackgroundIndex] : '') || undefined;

    const finalData = {
        id: selectedGame.id,
        title,
        coverImage,
        backgroundImage,
        releaseDate: selectedGame.releaseDate,
        studio,
            opencriticScore: fetchedOpenCritic || selectedGame.opencriticScore || null,
            opencriticUrl: fetchedOpenCriticUrl || selectedGame.opencriticUrl || null,
        source: selectedGame.source,
        genres: JSON.stringify(genres),
        platforms: platforms, // Json type, pass array directly
        description: selectedGame.description,
        status,
        targetedCompletionType: completionTarget
    };

    try {
         await addGameExtended(finalData);
    } catch (e) {
        console.error("Failed to add game:", e);
    }
    onClose();
  };

  const getScoreColor = (score: number | null | undefined) => {
    if (!score) return 'bg-gray-500';
    if (score >= 75) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
          "flex flex-col gap-0 p-0 transition-all duration-300",
          step === 'search' ? "sm:max-w-[500px]" : "sm:max-w-[900px] h-[90vh]"
      )}>
        <DialogHeader className="px-6 py-4 border-b shrink-0 flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between">
                <DialogTitle>
                    {step === 'search' ? 'Add Game' : 'Customize & Add'}
                </DialogTitle>

                {/* Switcher Centered in Mobile View, but only visible in customize step */}
                 {step === 'customize' && (
                    <div className="flex md:hidden bg-muted p-1 rounded-lg">
                         <button
                            onClick={() => setMobileTab('art')}
                            className={cn(
                                "text-xs font-medium px-4 py-1.5 rounded-md transition-all",
                                mobileTab === 'art' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                         >
                            Art
                         </button>
                         <button
                            onClick={() => setMobileTab('details')}
                            className={cn(
                                "text-xs font-medium px-4 py-1.5 rounded-md transition-all",
                                mobileTab === 'details' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                            )}
                         >
                            Data
                         </button>
                    </div>
                 )}
            </div>
        </DialogHeader>

        {step === 'search' ? (
             <div className="flex flex-col gap-4 p-6">
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Input
                            placeholder="Enter game title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                </div>

                <ScrollArea className="h-[400px] rounded-md border p-4">
                    {searchResults.length === 0 && !isSearching && (
                        <div className="text-center text-muted-foreground py-10 flex flex-col items-center gap-4">
                            <span>{searchQuery ? "No local results found." : "Enter a title to search."}</span>
                            {searchQuery && !hasSearchedOnline && (
                                <Button
                                    variant="secondary"
                                    onClick={handleExtendSearch}
                                >
                                    Search on IGDB
                                </Button>
                            )}
                        </div>
                    )}
                    {isSearching && (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    <div className="grid gap-2">
                        {searchResults.map((game) => (
                            <button
                                key={`${game.source}-${game.id}`}
                                onClick={() => selectGame(game)}
                                disabled={loadingGameId !== null}
                                className={cn(
                                    "flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left border border-transparent hover:border-border transition-colors group relative",
                                    loadingGameId === game.id && "opacity-70"
                                )}
                            >
                                <div className="h-14 w-10 relative bg-muted rounded overflow-hidden shrink-0">
                                    {game.availableCovers && game.availableCovers.length > 0 && (
                                        <Image src={game.availableCovers[0]} alt={game.title} fill className="object-cover" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium line-clamp-2 leading-tight">{game.title}</h3>
                                        <Badge variant="outline" className="text-[10px] h-5 px-1">{game.source.toUpperCase()}</Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span>{game.releaseDate ? new Date(game.releaseDate).getFullYear() : 'TBA'}</span>
                                            {game.studio && (
                                                <>
                                                    <span>|</span>
                                                    <span className="truncate">{game.studio}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {loadingGameId === game.id ? (
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                ) : (
                                    <>
                                        {game.metacritic && (
                                            <Badge className={cn("text-[10px] h-5 px-1.5", getScoreColor(game.metacritic))}>
                                                {game.metacritic}
                                            </Badge>
                                        )}
                                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                                    </>
                                )}
                            </button>
                        ))}

                        {!isSearching && searchResults.length > 0 && !hasSearchedOnline && (
                             <Button
                                variant="secondary"
                                className="w-full mt-4"
                                onClick={handleExtendSearch}
                             >
                                Not found? Search on IGDB
                             </Button>
                        )}
                    </div>
                </ScrollArea>
             </div>
        ) : (
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
               {/* Left Panel - Art Selection */}
               <div className={cn(
                   "w-full md:w-[58%] p-6 border-r flex flex-col gap-6 overflow-y-auto md:flex h-full",
                   mobileTab === 'art' ? "flex" : "hidden"
               )}>
                    {/* Cover Selection */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Select Cover Art</Label>
                        {selectedGame && selectedGame.availableCovers.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3">
                                {selectedGame.availableCovers.map((url, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => { setSelectedCoverIndex(idx); setCustomCoverUrl(''); }}
                                        className={cn(
                                            "relative aspect-[2/3] rounded-md overflow-hidden border-2 transition-all",
                                            selectedCoverIndex === idx && !customCoverUrl ? "border-cyan-500 ring-2 ring-cyan-500/20" : "border-transparent hover:border-white/20"
                                        )}
                                    >
                                        <Image src={url} alt="Cover option" fill className="object-cover" sizes="100px"/>
                                        {selectedCoverIndex === idx && !customCoverUrl && (
                                            <div className="absolute top-1 right-1 bg-cyan-500 text-black rounded-full p-0.5">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">No covers found.</div>
                        )}
                        <div className="flex gap-2 items-center">
                           <Input
                                placeholder="Or paste custom Cover URL..."
                                value={customCoverUrl}
                                onChange={(e) => {
                                    setCustomCoverUrl(e.target.value);
                                    if (e.target.value) setSelectedCoverIndex(-1);
                                }}
                                className="h-8 text-xs"
                           />
                        </div>
                    </div>

                    {/* Background Selection */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Select Background</Label>
                        {selectedGame && selectedGame.availableBackgrounds.length > 0 ? (
                             <div className="grid grid-cols-2 gap-3">
                                {selectedGame.availableBackgrounds.map((url, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => { setSelectedBackgroundIndex(idx); setCustomBackgroundUrl(''); }}
                                        className={cn(
                                            "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
                                            selectedBackgroundIndex === idx && !customBackgroundUrl ? "border-amber-500 ring-2 ring-amber-500/20" : "border-transparent hover:border-white/20"
                                        )}
                                    >
                                        <Image src={url} alt="Background option" fill className="object-cover" sizes="200px"/>
                                         {selectedBackgroundIndex === idx && !customBackgroundUrl && (
                                            <div className="absolute top-1 right-1 bg-amber-500 text-black rounded-full p-0.5">
                                                <Check className="h-3 w-3" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                             <div className="text-sm text-muted-foreground">No backgrounds found.</div>
                        )}

                         <div className="flex gap-2 items-center">
                           <Input
                                placeholder="Or paste custom Background URL..."
                                value={customBackgroundUrl}
                                onChange={(e) => {
                                    setCustomBackgroundUrl(e.target.value);
                                    if (e.target.value) setSelectedBackgroundIndex(-1);
                                }}
                                className="h-8 text-xs"
                           />
                        </div>
                    </div>

                    {/* Mobile Only Next Button */}
                    <div className="md:hidden pt-4 mt-auto">
                        <Button className="w-full" onClick={() => setMobileTab('details')}>
                            Next
                        </Button>
                    </div>
                </div>

                {/* Right Panel - Details */}
                <div className={cn(
                   "w-full md:w-[42%] flex flex-col md:flex h-full",
                   mobileTab === 'details' ? "flex" : "hidden"
                )}>
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            {/* Basic Info */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="game-title">Game Title</Label>
                                    <Input id="game-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="game-studio">Studio</Label>
                                    <Input id="game-studio" value={studio} onChange={(e) => setStudio(e.target.value)} />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select value={status} onValueChange={setStatus}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Status" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BACKLOG">Backlog</SelectItem>
                                                <SelectItem value="PLAYING">Playing</SelectItem>
                                                <SelectItem value="COMPLETED">Completed</SelectItem>
                                                <SelectItem value="ABANDONED">Dropped</SelectItem>
                                                <SelectItem value="WISHLIST">Wishlist</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Goal</Label>
                                        <Select value={completionTarget} onValueChange={setCompletionTarget}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Goal" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MAIN">Main Story</SelectItem>
                                                <SelectItem value="EXTRA">Main + Extra</SelectItem>
                                                <SelectItem value="COMPLETIONIST">Completionist</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Platform Selection - Toggle Style */}
                                    <div className="space-y-2">
                                        <Label>Platforms</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {availablePlatforms.length > 0 ? availablePlatforms.map((p, i) => {
                                                const isSelected = platforms.includes(p);
                                                return (
                                                    <Badge
                                                        key={i}
                                                        variant={isSelected ? "default" : "outline"}
                                                        className={cn(
                                                            "cursor-pointer hover:opacity-80 transition-all",
                                                            !isSelected && "opacity-50"
                                                        )}
                                                        onClick={() => togglePlatform(p)}
                                                    >
                                                        {p}
                                                    </Badge>
                                                );
                                            }) : (
                                                <span className="text-xs text-muted-foreground">No platforms found.</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Genres - Tag Input Style */}
                                    <div className="space-y-2">
                                        <Label>Genres</Label>
                                        <div className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                                            {genres.map((g, i) => (
                                                <Badge key={i} variant="secondary" className="hover:bg-destructive hover:text-destructive-foreground cursor-pointer transition-colors" onClick={() => setGenres(genres.filter((_, idx) => idx !== i))}>
                                                    {g}
                                                    <X className="ml-1 h-3 w-3" />
                                                </Badge>
                                            ))}
                                            <input
                                                className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[50px]"
                                                placeholder={genres.length === 0 ? "Add..." : ""}
                                                value={newGenre}
                                                onChange={(e) => setNewGenre(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if(e.key === 'Enter' && newGenre.trim()) {
                                                        e.preventDefault();
                                                        setGenres([...genres, newGenre.trim()]);
                                                        setNewGenre('');
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Compact Scores - Always Row */}
                                <div className="space-y-3 pt-4 border-t">
                                    <div className="flex items-center space-x-2">
                                        <Label className="cursor-pointer flex items-center gap-2 font-normal">
                                            <span className="font-bold text-sm">OpenCritic:</span>
                                            <Badge className={cn("text-[10px] h-5 px-1.5", getScoreColor(fetchedOpenCritic || selectedGame?.opencriticScore))}>
                                                {fetchedOpenCritic || selectedGame?.opencriticScore || 'N/A'}
                                            </Badge>
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    <div className="p-4 border-t bg-muted/20 flex justify-between items-center shrink-0">
                         <Button variant="ghost" onClick={() => setStep('search')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back
                        </Button>
                        <Button onClick={handleFinalSubmit} className="px-8">
                            Add Game
                        </Button>
                    </div>
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
