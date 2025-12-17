'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, ChevronDown, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { addGameById, searchGamesMultiProvider } from '@/actions/add-game';

// --- Types ---

export interface EnrichedGameResult {
  id: string;
  title: string;
  releaseYear: number;
  platforms: string[];
  availableCovers: string[];
  availableBackgrounds: string[];
  metadata: {
    hltb: {
      main: number;
      extra: number;
      completionist: number;
    };
    description?: string;
    score?: number;
  };
}

// --- Mock API ---

const MOCK_COVERS = [
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg", // Elden Ring
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/library_600x900.jpg", // Elden Ring Steam
    "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a55684a.jpg", // Elden Ring Rawg
    "https://howlongtobeat.com/games/68151_Elden_Ring.jpg" // HLTB
];

const MOCK_BACKGROUNDS = [
    "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc6khq.jpg",
    "https://media.rawg.io/media/games/5ec/5ecac5cb026ec26a56efcc546364e348.jpg",
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg"
];

const mockSearchGames = async (query: string): Promise<EnrichedGameResult[]> => {
    if (!query) return [];

    try {
        // Try to fetch real games if available
        const games = await searchGamesMultiProvider(query);
        if (games && games.length > 0) {
            return games.map((g: any) => ({
                id: String(g.id),
                title: g.name,
                releaseYear: g.released ? parseInt(g.released.split('-')[0]) : new Date().getFullYear(),
                platforms: g.platforms?.map((p: { platform: { name: string } }) => p.platform.name) || [],
                availableCovers: [...(g.extraCovers || []), g.background_image].filter(Boolean),
                availableBackgrounds: [...(g.extraBackgrounds || []), g.background_image].filter(Boolean),
                metadata: {
                    hltb: { main: 0, extra: 0, completionist: 0 }, // Would need separate fetch
                    score: g.rating ? g.rating * 20 : 0
                }
            }));
        }
    } catch (e) {
        console.warn("Failed to fetch real games, falling back to mock", e);
    }

    // Fallback to Mock results if real search fails or empty
    return [
        {
            id: `mock-${Date.now()}-1`,
            title: query,
            releaseYear: 2022,
            platforms: ["PC", "PS5", "Xbox Series X"],
            availableCovers: MOCK_COVERS,
            availableBackgrounds: MOCK_BACKGROUNDS,
            metadata: {
                hltb: { main: 50, extra: 80, completionist: 120 },
                score: 96,
                description: "A vast world awaits..."
            }
        },
        {
            id: `mock-${Date.now()}-2`,
            title: `${query}: GOTY Edition`,
            releaseYear: 2023,
            platforms: ["PC", "PS5"],
            availableCovers: [MOCK_COVERS[1], MOCK_COVERS[0]],
            availableBackgrounds: [MOCK_BACKGROUNDS[1]],
            metadata: {
                hltb: { main: 60, extra: 90, completionist: 130 },
                score: 98
            }
        },
         {
            id: `mock-${Date.now()}-3`,
            title: `The Art of ${query}`,
            releaseYear: 2022,
            platforms: [],
            availableCovers: [MOCK_COVERS[3]],
            availableBackgrounds: [MOCK_BACKGROUNDS[2]],
            metadata: {
                hltb: { main: 0, extra: 0, completionist: 0 },
                score: 0
            }
        }
    ];
};

// --- Component ---

interface AddGameWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddGameWizardDialog({ isOpen, onClose }: AddGameWizardDialogProps) {
  // State
  const [step, setStep] = useState<'search' | 'customize'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [provider, setProvider] = useState('igdb');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EnrichedGameResult[]>([]);

  // Selection State (Draft)
  const [selectedGame, setSelectedGame] = useState<EnrichedGameResult | null>(null);

  // Customization State
  const [title, setTitle] = useState('');
  const [releaseYear, setReleaseYear] = useState<string>('');
  const [platform, setPlatform] = useState('Steam'); // Default
  const [status, setStatus] = useState('Backlog');

  // Media State
  const [selectedCoverIndex, setSelectedCoverIndex] = useState(0);
  const [selectedBackgroundIndex, setSelectedBackgroundIndex] = useState(0);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState('');

  // Advanced Options State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hltbMain, setHltbMain] = useState('');
  const [hltbExtra, setHltbExtra] = useState('');
  const [hltbCompletionist, setHltbCompletionist] = useState('');

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
        // slight delay to allow exit animation
        const timer = setTimeout(() => {
            setStep('search');
            setSearchQuery('');
            setSearchResults([]);
            setSelectedGame(null);
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
        const results = await mockSearchGames(searchQuery);
        setSearchResults(results);
    } catch (e) {
        console.error(e);
    } finally {
        setIsSearching(false);
    }
  };

  const selectGame = (game: EnrichedGameResult) => {
    setSelectedGame(game);
    // Initialize draft fields
    setTitle(game.title);
    setReleaseYear(game.releaseYear.toString());
    setHltbMain(game.metadata.hltb.main.toString());
    setHltbExtra(game.metadata.hltb.extra.toString());
    setHltbCompletionist(game.metadata.hltb.completionist.toString());
    setSelectedCoverIndex(0);
    setSelectedBackgroundIndex(0);
    setStep('customize');
  };

  const handleFinalSubmit = async () => {
    if (!selectedGame) return;

    // Construct the final object
    const finalData = {
        ...selectedGame,
        title,
        releaseYear: parseInt(releaseYear),
        status,
        platform,
        coverImage: customCoverUrl || selectedGame?.availableCovers[selectedCoverIndex],
        backgroundImage: customBackgroundUrl || selectedGame?.availableBackgrounds[selectedBackgroundIndex],
        hltb: {
            main: parseFloat(hltbMain) || 0,
            extra: parseFloat(hltbExtra) || 0,
            completionist: parseFloat(hltbCompletionist) || 0
        }
    };

    console.log("Submitting Game Data:", finalData);

    try {
        // Attempt to add the game using existing actions
        if (!selectedGame.id.startsWith('mock-')) {
             await addGameById(parseInt(selectedGame.id));
             // Note: addGameById doesn't support manual overrides yet, so we would theoretically
             // follow up with updateLibraryEntry or similar if the API supported it.
             // For now, this at least adds the game to the library.
        } else {
             // For mock games, we can't really add them without a 'createCustomGame' action.
             // We'll fallback to searchAndAddGame if the title matches, or just log for now.
             console.log("Cannot persist mock game without backend support.");
        }
    } catch (e) {
        console.error("Failed to add game:", e);
    }

    onClose();
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
                    <Select value={provider} onValueChange={setProvider}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Provider" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="igdb">IGDB (Pref)</SelectItem>
                            <SelectItem value="steam">Steam</SelectItem>
                            <SelectItem value="rawg">Rawg</SelectItem>
                        </SelectContent>
                    </Select>
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
                                key={game.id}
                                onClick={() => selectGame(game)}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left border border-transparent hover:border-border transition-colors group"
                            >
                                <div className="h-14 w-10 relative bg-muted rounded overflow-hidden shrink-0">
                                    {game.availableCovers[0] && (
                                        <Image src={game.availableCovers[0]} alt={game.title} fill className="object-cover" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-medium truncate">{game.title}</h3>
                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span>{game.releaseYear}</span>
                                        <span>•</span>
                                        <span className="truncate">{game.platforms.join(', ')}</span>
                                    </div>
                                </div>
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
                        <div className="grid grid-cols-4 gap-3">
                            {selectedGame?.availableCovers.map((url, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedCoverIndex(idx)}
                                    className={cn(
                                        "relative aspect-[2/3] rounded-md overflow-hidden border-2 transition-all",
                                        selectedCoverIndex === idx ? "border-cyan-500 ring-2 ring-cyan-500/20" : "border-transparent hover:border-white/20"
                                    )}
                                >
                                    <Image src={url} alt="Cover option" fill className="object-cover" sizes="100px"/>
                                    {selectedCoverIndex === idx && (
                                        <div className="absolute top-1 right-1 bg-cyan-500 text-black rounded-full p-0.5">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 items-center">
                           <Input
                                placeholder="Or paste custom URL..."
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
                        <div className="grid grid-cols-2 gap-3">
                            {selectedGame?.availableBackgrounds.map((url, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedBackgroundIndex(idx)}
                                    className={cn(
                                        "relative aspect-video rounded-md overflow-hidden border-2 transition-all",
                                        selectedBackgroundIndex === idx ? "border-amber-500 ring-2 ring-amber-500/20" : "border-transparent hover:border-white/20"
                                    )}
                                >
                                    <Image src={url} alt="Background option" fill className="object-cover" sizes="200px"/>
                                     {selectedBackgroundIndex === idx && (
                                        <div className="absolute top-1 right-1 bg-amber-500 text-black rounded-full p-0.5">
                                            <Check className="h-3 w-3" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                         <div className="flex gap-2 items-center">
                           <Input
                                placeholder="Or paste custom URL..."
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
                                                <SelectItem value="Backlog">Backlog</SelectItem>
                                                <SelectItem value="Playing">Playing</SelectItem>
                                                <SelectItem value="Completed">Completed</SelectItem>
                                                <SelectItem value="Wishlist">Wishlist</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Platform</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {["Steam", "PlayStation", "Xbox", "Switch", "GOG", "Epic"].map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setPlatform(p)}
                                                className={cn(
                                                    "px-3 py-1 rounded-full text-xs border transition-colors",
                                                    platform === p
                                                        ? "bg-primary text-primary-foreground border-primary"
                                                        : "bg-muted text-muted-foreground border-transparent hover:border-border"
                                                )}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Advanced Toggle */}
                            <div className="pt-4 border-t">
                                <Button
                                    variant="ghost"
                                    className="w-full flex justify-between items-center"
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                >
                                    <span>Advanced Options</span>
                                    <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
                                </Button>

                                {showAdvanced && (
                                    <div className="pt-4 space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground uppercase tracking-wider">HowLongToBeat (Hours)</Label>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <Label className="text-xs">Main</Label>
                                                    <Input type="number" value={hltbMain} onChange={(e) => setHltbMain(e.target.value)} className="h-8" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Extra</Label>
                                                    <Input type="number" value={hltbExtra} onChange={(e) => setHltbExtra(e.target.value)} className="h-8" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Comp.</Label>
                                                    <Input type="number" value={hltbCompletionist} onChange={(e) => setHltbCompletionist(e.target.value)} className="h-8" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>External Links</Label>
                                            <Input placeholder="Metacritic URL" className="h-8" />
                                            <Input placeholder="OpenCritic URL" className="h-8" />
                                        </div>
                                         <div className="space-y-2">
                                            <Label>Tags</Label>
                                            <Input placeholder="Add tags separated by comma..." className="h-8" />
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
