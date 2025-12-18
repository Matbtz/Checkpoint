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
import { addGameExtended, searchLocalGamesAction, searchOnlineGamesAction } from '@/actions/add-game';
import { EnrichedGameData } from '@/lib/enrichment';
import { Badge } from '@/components/ui/badge';

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

    // Nouveaux états pour les champs manquants
    const [genres, setGenres] = useState<string[]>([]);
    const [platforms, setPlatforms] = useState<string[]>([]);
    const [metacritic, setMetacritic] = useState<number | null>(null);
    const [opencritic, setOpencritic] = useState<number | null>(null);
    const [preferredScore, setPreferredScore] = useState<'metacritic' | 'opencritic'>('metacritic');

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
            setSearchResults(results);
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
            const onlineResults = await searchOnlineGamesAction(searchQuery);

            setSearchResults(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newResults = onlineResults.filter(r => !existingIds.has(r.id));
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
    const selectGame = (game: EnrichedGameData) => {
        setSelectedGame(game);
        setTitle(game.title);
        setStudio(game.studio || '');
        setGenres(game.genres || []);
        setPlatforms(game.platforms || []);
        // Mise à jour des scores
        setMetacritic(game.metacritic || null);
        setOpencritic(game.opencritic || null);
        // Logique par défaut : prendre le score le plus pertinent
        if (game.opencritic) setPreferredScore('opencritic');
        else if (game.metacritic) setPreferredScore('metacritic');

        setSelectedCoverIndex(0);
        setSelectedBackgroundIndex(0);
        setCustomCoverUrl('');
        setCustomBackgroundUrl('');
        setStep('customize');
    };

    // ... (Fonction handleFinalSubmit inchangée) ...
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
            metacritic: metacritic,
            opencritic: opencritic,
            source: selectedGame.source,
            genres: genres,
            platforms: platforms,
            // On sauvegarde le choix de l'utilisateur dans le JSON scores si besoin, 
            // ou on laisse le backend gérer. Le user a demandé "record both".
            // Le backend a été maj pour accepter opencritic.
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
                                                <Image src={url} alt="Cover option" fill className="object-cover" sizes="100px" />
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
                                                <Image src={url} alt="Background option" fill className="object-cover" sizes="200px" />
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
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Studio</Label>
                                        <Input value={studio} onChange={(e) => setStudio(e.target.value)} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Metacritic</Label>
                                            <Input
                                                type="number"
                                                value={metacritic || ''}
                                                onChange={(e) => setMetacritic(e.target.value ? parseInt(e.target.value) : null)}
                                                className={cn(preferredScore === 'metacritic' ? "border-green-500 ring-1 ring-green-500" : "")}
                                            />
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="radio"
                                                    id="score-meta"
                                                    checked={preferredScore === 'metacritic'}
                                                    onChange={() => setPreferredScore('metacritic')}
                                                    className="accent-green-500"
                                                />
                                                <Label htmlFor="score-meta" className="text-xs font-normal text-muted-foreground">Display this score</Label>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>OpenCritic</Label>
                                            <Input
                                                type="number"
                                                value={opencritic || ''}
                                                onChange={(e) => setOpencritic(e.target.value ? parseInt(e.target.value) : null)}
                                                className={cn(preferredScore === 'opencritic' ? "border-purple-500 ring-1 ring-purple-500" : "")}
                                            />
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="radio"
                                                    id="score-open"
                                                    checked={preferredScore === 'opencritic'}
                                                    onChange={() => setPreferredScore('opencritic')}
                                                    className="accent-purple-500"
                                                />
                                                <Label htmlFor="score-open" className="text-xs font-normal text-muted-foreground">Display this score</Label>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Genres</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {genres.map((g, i) => (
                                                <Badge key={i} variant="secondary">{g}</Badge>
                                            ))}
                                            {genres.length === 0 && <span className="text-sm text-muted-foreground italic">No genres found</span>}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Platforms</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {platforms.map((p, i) => (
                                                <Badge key={i} variant="outline">{p}</Badge>
                                            ))}
                                            {platforms.length === 0 && <span className="text-sm text-muted-foreground italic">No platforms found</span>}
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
            </DialogContent >
        </Dialog >
    );
}
