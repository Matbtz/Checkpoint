'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { addGameExtended, searchGamesAction } from '@/actions/add-game';
import { EnrichedGameData } from '@/lib/enrichment';
import { Badge } from '@/components/ui/badge';

interface AddGameWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddGameWizardDialog({ isOpen, onClose }: AddGameWizardDialogProps) {
  // State
  const [step, setStep] = useState<'search' | 'customize'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EnrichedGameData[]>([]);

  // Selection State (Draft)
  const [selectedGame, setSelectedGame] = useState<EnrichedGameData | null>(null);

  // Customization State
  const [title, setTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState<string>('');
  const [status, setStatus] = useState('BACKLOG'); // Changed default to BACKLOG to match Prisma enum convention if needed, though frontend display might differ
  const [studio, setStudio] = useState('');

  // Media State
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(0);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState('');

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
        // slight delay to allow exit animation
        const timer = setTimeout(() => {
            setStep('search');
            setSearchQuery('');
            setSearchResults([]);
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
    try {
        const results = await searchGamesAction(searchQuery);
        setSearchResults(results);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSearching(false);
    }
  };

  const selectGame = (game: EnrichedGameData) => {
    setSelectedGame(game);
    // Initialize draft fields
    setTitle(game.title);
    setReleaseYear(game.releaseDate ? new Date(game.releaseDate).getFullYear().toString() : '');
    setStudio(game.studio || '');

    // Select first image by default
    setSelectedCoverIndex(0);
    setSelectedBackgroundIndex(0);

    // Reset customs
    setCustomCoverUrl('');
    setCustomBackgroundUrl('');

    setStep('customize');
  };

  const handleFinalSubmit = async () => {
    if (!selectedGame) return;

    // Use selected cover/bg or custom override
    const coverImage = customCoverUrl || (selectedGame.possibleCovers.length > 0 ? selectedGame.possibleCovers[selectedCoverIndex] : '') || '';
    const backgroundImage = customBackgroundUrl || (selectedGame.possibleBackgrounds.length > 0 ? selectedGame.possibleBackgrounds[selectedBackgroundIndex] : '') || undefined;

    const finalData = {
        id: selectedGame.id,
        title,
        coverImage,
        backgroundImage,
        releaseDate: selectedGame.releaseDate,
        studio,
        metacritic: selectedGame.metacritic || undefined,
        source: selectedGame.source
    };

    console.log("Submitting Game Data:", finalData);

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

        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>
            {step === 'search' ? 'Add Game' : 'Customize & Add'}
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        {step === 'search' ? (
             <div className="flex flex-col gap-4 p-6">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            placeholder="Enter game title..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button size="icon" onClick={handleSearch} disabled={isSearching}>
                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                </div>

                <ScrollArea className="h-[400px] rounded-md border p-4">
                    {searchResults.length === 0 && !isSearching && (
                        <div className="text-center text-muted-foreground py-10">
                            Enter a title to search.
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
                                    {game.possibleCovers && game.possibleCovers.length > 0 && (
                                        <Image src={game.possibleCovers[0]} alt={game.title} fill className="object-cover" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium truncate">{game.title}</h3>
                                        <Badge variant="outline" className="text-[10px] h-5 px-1">{game.source.toUpperCase()}</Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span>{game.releaseDate ? new Date(game.releaseDate).getFullYear() : 'TBA'}</span>
                                        {game.studio && (
                                            <>
                                                <span>•</span>
                                                <span className="truncate">{game.studio}</span>
                                            </>
                                        )}
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
                    </div>
                </ScrollArea>
             </div>
        ) : (
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                {/* Left Panel: Media Picker */}
                <div className="w-full md:w-1/2 p-6 border-r flex flex-col gap-6 overflow-y-auto">

                    {/* Cover Selection */}
                    <div className="space-y-3">
                        <Label className="text-base font-semibold">Select Cover Art</Label>
                        {selectedGame && selectedGame.possibleCovers.length > 0 ? (
                            <div className="grid grid-cols-4 gap-3">
                                {selectedGame.possibleCovers.map((url, idx) => (
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
                        {selectedGame && selectedGame.possibleBackgrounds.length > 0 ? (
                             <div className="grid grid-cols-2 gap-3">
                                {selectedGame.possibleBackgrounds.map((url, idx) => (
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

                {/* Right Panel: Fields */}
                <div className="w-full md:w-1/2 flex flex-col">
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">

                            {/* Basic Info */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="game-title">Game Title</Label>
                                    <Input id="game-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-2">
                                        <Label>Release Year</Label>
                                        <Input type="number" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Status</Label>
                                        <Select value={status} onValueChange={setStatus}>
                                            <SelectTrigger>
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
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Studio</Label>
                                    <Input value={studio} onChange={(e) => setStudio(e.target.value)} placeholder="Developer / Studio" />
                                </div>

                                {selectedGame?.metacritic && (
                                    <div className="space-y-2">
                                        <Label>Metacritic Score</Label>
                                        <div className="flex items-center gap-2">
                                            <Badge className={cn("text-sm h-7 px-2", getScoreColor(selectedGame.metacritic))}>
                                                {selectedGame.metacritic}
                                            </Badge>
                                            <span className="text-sm text-muted-foreground">Detected from {selectedGame.source.toUpperCase()}</span>
                                        </div>
                                    </div>
                                )}
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
