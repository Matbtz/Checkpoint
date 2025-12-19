'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ChevronRight, Check, ArrowLeft } from 'lucide-react'; // "Search" retiré car inutilisé
import Image from 'next/image';
import { cn } from '@/lib/utils';
// CORRECTION ICI : Utilisation des bons noms de fonctions
import { addGameExtended, searchLocalGamesAction, searchOnlineGamesAction, fetchOpenCriticAction } from '@/actions/add-game';
import { EnrichedGameData } from '@/lib/enrichment';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface AddGameWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddGameWizardDialog({ isOpen, onClose }: AddGameWizardDialogProps) {
  const [step, setStep] = useState<'search' | 'customize'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EnrichedGameData[]>([]);
  const [hasSearchedOnline, setHasSearchedOnline] = useState(false);

  // ... (Reste des states inchangé) ...
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
  const [newGenre, setNewGenre] = useState('');

  // Scores
  const [fetchedOpenCritic, setFetchedOpenCritic] = useState<number | null>(null);
  const [selectedScoreSource, setSelectedScoreSource] = useState<'metacritic' | 'opencritic'>('metacritic');

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
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearchedOnline(false);
    try {
        // CORRECTION : Appel à searchLocalGamesAction
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
  };

  const handleExtendSearch = async () => {
    setIsSearching(true);
    try {
        // CORRECTION : Appel à searchOnlineGamesAction
        // Le type de retour est maintenant Promise<EnrichedGameData[]>, donc le cast n'est plus nécessaire si on mappe correctement
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

  // ... (Fonction selectGame inchangée) ...
  const selectGame = async (game: EnrichedGameData) => {
    setSelectedGame(game);
    setTitle(game.title);
    setStudio(game.studio || '');
    setGenres(game.genres || []);
    setPlatforms(game.platforms || []);
    setSelectedCoverIndex(0);
    setSelectedBackgroundIndex(0);
    setCustomCoverUrl('');
    setCustomBackgroundUrl('');
    setStep('customize');

    // Fetch OpenCritic immediately
    setFetchedOpenCritic(null);
    if (game.source !== 'manual' && game.source !== 'local') {
        try {
            const score = await fetchOpenCriticAction(game.title);
            if (score) setFetchedOpenCritic(score);
        } catch (e) {
            console.error("Failed to fetch OpenCritic score:", e);
        }
    } else if (game.opencritic) {
        setFetchedOpenCritic(game.opencritic);
    }
  };

  // ... (Fonction handleFinalSubmit inchangée) ...
  const handleFinalSubmit = async () => {
    if (!selectedGame) return;
    const coverImage = customCoverUrl || (selectedGame.availableCovers.length > 0 ? selectedGame.availableCovers[selectedCoverIndex] : '') || '';
    const backgroundImage = customBackgroundUrl || (selectedGame.availableBackgrounds.length > 0 ? selectedGame.availableBackgrounds[selectedBackgroundIndex] : '') || undefined;

    // Determine final score logic
    let finalMetacritic = selectedGame.metacritic;

    // STRICT HACK: If OpenCritic is selected, we override 'metacritic' with the OpenCritic value so GameCard displays it.
    // If OpenCritic is null/N/A, this will effectively hide the badge (setting metacritic to null), which is correct if the user chose OpenCritic.
    if (selectedScoreSource === 'opencritic') {
        finalMetacritic = fetchedOpenCritic || selectedGame.opencritic || null;
    }

    const finalData = {
        id: selectedGame.id,
        title,
        coverImage,
        backgroundImage,
        releaseDate: selectedGame.releaseDate,
        studio,
        metacritic: finalMetacritic || undefined,
        opencritic: fetchedOpenCritic || selectedGame.opencritic || null,
        source: selectedGame.source,
        genres: JSON.stringify(genres), // Convert array to string for DB
        platforms: JSON.stringify(platforms), // Convert array to string for DB
        description: selectedGame.description
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
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>
            {step === 'search' ? 'Add Game' : 'Customize & Add'}
          </DialogTitle>
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
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left border border-transparent hover:border-border transition-colors group"
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
                                {game.metacritic && (
                                    <Badge className={cn("text-[10px] h-5 px-1.5", getScoreColor(game.metacritic))}>
                                        {game.metacritic}
                                    </Badge>
                                )}
                                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            </button>
                        ))}

                        {/* BOUTON ÉTENDRE LA RECHERCHE */}
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
            // ... (Partie Customize inchangée - assurez-vous de garder le code existant ici)
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
               {/* Left Panel code... */}
               <div className="w-full md:w-1/2 p-6 border-r flex flex-col gap-6 overflow-y-auto">
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
                </div>

                {/* Right Panel code... */}
                <div className="w-full md:w-1/2 flex flex-col">
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

                                <div className="space-y-2">
                                    <Label>Platforms</Label>
                                    <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-md min-h-[40px]">
                                        {platforms.length > 0 ? (
                                            platforms.map((p, i) => (
                                                <Badge key={i} variant="secondary">{p}</Badge>
                                            ))
                                        ) : (
                                            <span className="text-sm text-muted-foreground">No platforms found</span>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Genres</Label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {genres.map((g, i) => (
                                            <Badge key={i} className="cursor-pointer hover:bg-destructive" onClick={() => setGenres(genres.filter((_, idx) => idx !== i))}>
                                                {g} ⨯
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Add genre..."
                                            value={newGenre}
                                            onChange={(e) => setNewGenre(e.target.value)}
                                            onKeyDown={(e) => {
                                                if(e.key === 'Enter' && newGenre.trim()) {
                                                    setGenres([...genres, newGenre.trim()]);
                                                    setNewGenre('');
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => {
                                                if(newGenre.trim()) {
                                                    setGenres([...genres, newGenre.trim()]);
                                                    setNewGenre('');
                                                }
                                            }}
                                        >
                                            Add
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-3 pt-4 border-t">
                                    <Label className="text-base font-semibold">Display Score</Label>
                                    <RadioGroup value={selectedScoreSource} onValueChange={(v) => setSelectedScoreSource(v as 'metacritic' | 'opencritic')} className="grid grid-cols-2 gap-4">
                                        <div>
                                            <RadioGroupItem value="metacritic" id="score-meta" className="peer sr-only" />
                                            <Label
                                                htmlFor="score-meta"
                                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                            >
                                                <span className="mb-2 font-bold">Metacritic</span>
                                                <div className={cn("text-2xl font-black", getScoreColor(selectedGame?.metacritic))}>
                                                    {selectedGame?.metacritic || 'N/A'}
                                                </div>
                                            </Label>
                                        </div>
                                        <div>
                                            <RadioGroupItem value="opencritic" id="score-open" className="peer sr-only" />
                                            <Label
                                                htmlFor="score-open"
                                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                            >
                                                <span className="mb-2 font-bold">OpenCritic</span>
                                                <div className={cn("text-2xl font-black", getScoreColor(fetchedOpenCritic || selectedGame?.opencritic))}>
                                                    {fetchedOpenCritic || selectedGame?.opencritic || 'N/A'}
                                                </div>
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                    <div className="p-4 border-t bg-muted/20 flex justify-between items-center shrink-0">
                         <Button variant="ghost" onClick={() => setStep('search')}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Search
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
