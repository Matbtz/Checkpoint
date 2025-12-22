'use client';

import { useState, useMemo } from 'react';
import { Game } from '@prisma/client';
import { HomeGameCard } from './HomeGameCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface TopRatedGamesProps {
  games: Game[];
}

interface Platform {
  name: string;
  date?: string;
}

const PLATFORMS = [
  { id: 'all', label: 'All Platforms' },
  { id: 'PC', label: 'PC' },
  { id: 'PlayStation', label: 'PlayStation' },
  { id: 'Xbox', label: 'Xbox' },
  { id: 'Switch', label: 'Switch' },
];

export function TopRatedGames({ games }: TopRatedGamesProps) {
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  const filteredGames = useMemo(() => {
    if (selectedPlatform === 'all') {
      return games.slice(0, 10);
    }

    return games.filter((game) => {
        if (!game.platforms) return false;

        // Handle various Json structures safely
        let platforms: Platform[] = [];
        if (Array.isArray(game.platforms)) {
             platforms = game.platforms as unknown as Platform[];
        } else if (typeof game.platforms === 'string') {
             try {
                 platforms = JSON.parse(game.platforms);
             } catch {
                 return false;
             }
        }

        // Check if any platform name contains the selected platform string (case-insensitive partial match)
        return platforms.some((p) =>
            p.name && p.name.toLowerCase().includes(selectedPlatform.toLowerCase())
        );
    }).slice(0, 10);
  }, [games, selectedPlatform]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">Top Rated Games of {new Date().getFullYear()}</h2>
        <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex bg-zinc-100 dark:bg-zinc-800">
             {PLATFORMS.map((platform) => (
                <TabsTrigger key={platform.id} value={platform.id} className="text-xs sm:text-sm">
                    {platform.label}
                </TabsTrigger>
             ))}
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex w-max space-x-4 p-1">
          {filteredGames.length > 0 ? (
              filteredGames.map((game, index) => (
                <HomeGameCard key={game.id} game={game} rank={index + 1} />
              ))
          ) : (
               <div className="flex items-center justify-center h-[200px] w-full text-zinc-500 text-sm italic p-8">
                   No top rated games found for this platform yet.
               </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
