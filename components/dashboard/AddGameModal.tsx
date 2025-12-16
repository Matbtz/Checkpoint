'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { searchGamesAction, addGameById } from '@/actions/add-game';
import { Loader2, Search, Plus, Calendar } from 'lucide-react';
import Image from 'next/image';
import { RawgGame } from '@/lib/rawg';

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddGameModal({ isOpen, onClose }: AddGameModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RawgGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setHasSearched(false);
    setResults([]);

    try {
      const games = await searchGamesAction(query);
      setResults(games);
      setHasSearched(true);
    } catch (err) {
      setError('Failed to search games. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGame = async (gameId: number) => {
    setAddingId(gameId);
    try {
        await addGameById(gameId);
        onClose();
        // Reset state
        setQuery('');
        setResults([]);
        setHasSearched(false);
    } catch (err: unknown) {
        if (err instanceof Error && err.message === "Game already in library") {
            setError("This game is already in your library.");
        } else {
            setError("Failed to add game.");
        }
    } finally {
        setAddingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Add Game</DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-2 pb-4 border-b">
            <div className="flex gap-2">
                <Input
                placeholder="Search game title..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
                />
                <Button size="icon" onClick={handleSearch} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
            </div>
            {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
        </div>

        <ScrollArea className="flex-1 p-6 pt-2">
            {hasSearched && results.length === 0 ? (
                <div className="text-center text-muted-foreground py-10">
                    No games found.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-2">
                    {results.map((game) => (
                        <div
                            key={game.id}
                            className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border cursor-pointer group"
                            onClick={() => handleAddGame(game.id)}
                        >
                            <div className="relative h-16 w-12 flex-shrink-0 bg-muted rounded overflow-hidden">
                                {game.background_image ? (
                                    <Image
                                        src={game.background_image}
                                        alt={game.name}
                                        fill
                                        className="object-cover"
                                        sizes="48px"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                                        <span className="text-xs text-muted-foreground">?</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium truncate text-base">{game.name}</h3>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                    {game.released && (
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {game.released.split('-')[0]}
                                        </span>
                                    )}
                                    {game.platforms && game.platforms.length > 0 && (
                                        <span className="truncate">
                                            • {game.platforms.map(p => p.platform.name).slice(0, 3).join(', ')}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <Button
                                size="sm"
                                variant="secondary"
                                disabled={addingId === game.id}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {addingId === game.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
