"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Gamepad2, Image as ImageIcon, Shuffle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { searchLocalGames } from "@/actions/search"; // We need a way to search local DB

// We'll likely need a server action to search only OWNED games or use the searchLocalGames existing one.
// searchLocalGames filters by status? Let's check imports.
// Actually, for "Select a banner from all games in the database", it implies searching the Game table or UserLibrary?
// "random from library" implies UserLibrary.
// "Select a banner from all games in the database" -> implies potentially any game enriched in DB?
// Usually user wants *their* games. But "all games in the database" was the specific wording.
// Let's assume "all games in the DB" (Global Game Table).
// I'll reuse `searchLocalGames` which searches the `Game` table.

interface ProfileBackgroundSelectorProps {
    mode: string;
    url: string;
    gameId: string | null;
    onModeChange: (mode: string) => void;
    onUrlChange: (url: string) => void;
    onGameIdChange: (id: string | null) => void;
}

export function ProfileBackgroundSelector({
    mode,
    url,
    gameId,
    onModeChange,
    onUrlChange,
    onGameIdChange
}: ProfileBackgroundSelectorProps) {
    const [open, setOpen] = useState(false);
    const [selectedGameName, setSelectedGameName] = useState("");
    const [searchResults, setSearchResults] = useState<{ id: string, title: string }[]>([]);

    // We need to fetch the initial game name if gameId is present
    useEffect(() => {
        if (gameId && !selectedGameName) {
            // Ideally we pass this prop or fetch it. For now, let's leave it generic or fetch on mount.
            // Simplified: user sees "Selected Game" placeholder if we don't fetch.
            // Let's try to search by ID to get title? Or just let the user re-select if they want to change.
             setSelectedGameName("Selected Game (ID: " + gameId.substring(0,8) + "...)");
        }
    }, [gameId]);

    const handleSearch = async (query: string) => {
        if (query.length < 2) return;
        // Reuse searchLocalGames or similar
        // Since searchLocalGames is server action, we can call it.
        try {
            const results = await searchLocalGames(query);
            // results is EnrichedGameData[]
            setSearchResults(results.map(r => ({ id: r.id, title: r.title })));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-4">
            <RadioGroup value={mode} onValueChange={onModeChange} className="grid grid-cols-2 gap-4">
                <div>
                    <RadioGroupItem value="URL" id="mode-url" className="peer sr-only" />
                    <Label
                        htmlFor="mode-url"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <ImageIcon className="mb-3 h-6 w-6" />
                        Custom URL
                    </Label>
                </div>
                <div>
                    <RadioGroupItem value="DYNAMIC_LAST" id="mode-last" className="peer sr-only" />
                    <Label
                        htmlFor="mode-last"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <Clock className="mb-3 h-6 w-6" />
                        Last Played
                    </Label>
                </div>
                <div>
                    <RadioGroupItem value="DYNAMIC_RANDOM" id="mode-random" className="peer sr-only" />
                    <Label
                        htmlFor="mode-random"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <Shuffle className="mb-3 h-6 w-6" />
                        Random Library
                    </Label>
                </div>
                <div>
                    <RadioGroupItem value="STATIC_GAME" id="mode-game" className="peer sr-only" />
                    <Label
                        htmlFor="mode-game"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                    >
                        <Gamepad2 className="mb-3 h-6 w-6" />
                        Specific Game
                    </Label>
                </div>
            </RadioGroup>

            {mode === "URL" && (
                <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input
                        value={url || ""}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="https://..."
                        className="bg-zinc-900 border-zinc-700"
                    />
                </div>
            )}

            {mode === "STATIC_GAME" && (
                 <div className="space-y-2">
                    <Label>Select Game</Label>
                    <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between bg-zinc-900 border-zinc-700"
                        >
                        {selectedGameName || "Select game..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0">
                        <Command shouldFilter={false}>
                        <CommandInput placeholder="Search database..." onValueChange={handleSearch} />
                        <CommandList>
                            <CommandEmpty>No game found.</CommandEmpty>
                            <CommandGroup>
                            {searchResults.map((game) => (
                                <CommandItem
                                key={game.id}
                                value={game.title}
                                onSelect={() => {
                                    onGameIdChange(game.id);
                                    setSelectedGameName(game.title);
                                    setOpen(false);
                                }}
                                >
                                <Check
                                    className={cn(
                                    "mr-2 h-4 w-4",
                                    gameId === game.id ? "opacity-100" : "opacity-0"
                                    )}
                                />
                                {game.title}
                                </CommandItem>
                            ))}
                            </CommandGroup>
                        </CommandList>
                        </Command>
                    </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">Search for a game to use its background art.</p>
                 </div>
            )}
        </div>
    );
}
