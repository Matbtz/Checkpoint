'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SteamGame } from '@/lib/steam';
import { importGames, getSteamImportCandidates } from '@/actions/steam';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2 } from 'lucide-react';

export default function SteamImportModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [games, setGames] = useState<SteamGame[]>([]);
  const [minPlaytime, setMinPlaytime] = useState(0);
  const [selectedGames, setSelectedGames] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGames = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const candidates = await getSteamImportCandidates();
      setGames(candidates);
      // Select all by default or none? Let's select none by default to be safe, or maybe filtered ones.
      // Usually users want to pick.
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load Steam games';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      loadGames();
    } else {
        // Reset state
        setGames([]);
        setSelectedGames(new Set());
        setMinPlaytime(0);
    }
  };

  const filteredGames = games.filter(g => g.playtime_forever >= minPlaytime * 60);

  const handleToggleSelect = (appid: number) => {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(appid)) {
      newSelected.delete(appid);
    } else {
      newSelected.add(appid);
    }
    setSelectedGames(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGames.size === filteredGames.length && filteredGames.length > 0) {
        setSelectedGames(new Set());
    } else {
        setSelectedGames(new Set(filteredGames.map(g => g.appid)));
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const gamesToImport = filteredGames.filter(g => selectedGames.has(g.appid));
      await importGames(gamesToImport);
      setIsOpen(false);
      router.refresh();
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Import failed';
        setError(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
            Import from Steam
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Steam Games</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden gap-4">
            {error ? (
                <div className="bg-red-50 text-red-700 p-4 rounded-md">
                    {error}
                </div>
            ) : isLoading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : games.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                    No new games found to import.
                </div>
            ) : (
                <>
                    <div className="flex gap-4 items-center bg-secondary/20 p-4 rounded-md">
                        <div className="flex-1">
                            <label className="text-sm font-medium mb-1 block">Min Playtime (Hours)</label>
                            <Input
                                type="number"
                                min="0"
                                value={minPlaytime}
                                onChange={(e) => setMinPlaytime(Number(e.target.value))}
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                             <span className="text-sm text-muted-foreground">
                                {filteredGames.length} available
                             </span>
                        </div>
                    </div>

                    <div className="border rounded-md flex-1 overflow-hidden">
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 border-b bg-muted/50 font-medium text-sm">
                             <Checkbox
                                checked={selectedGames.size === filteredGames.length && filteredGames.length > 0}
                                onCheckedChange={handleSelectAll}
                             />
                             <div>Game</div>
                             <div>Playtime</div>
                             <div>ID</div>
                        </div>
                        <ScrollArea className="h-[400px]">
                            <div className="divide-y">
                                {filteredGames.map(game => (
                                    <div key={game.appid} className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 items-center hover:bg-muted/30">
                                        <Checkbox
                                            checked={selectedGames.has(game.appid)}
                                            onCheckedChange={() => handleToggleSelect(game.appid)}
                                        />
                                        <div className="font-medium">{game.name}</div>
                                        <div className="text-sm text-muted-foreground">{(game.playtime_forever / 60).toFixed(1)}h</div>
                                        <div className="text-xs text-muted-foreground font-mono">{game.appid}</div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button onClick={handleImport} disabled={isImporting || selectedGames.size === 0}>
                            {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Import {selectedGames.size} Games
                        </Button>
                    </div>
                </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
