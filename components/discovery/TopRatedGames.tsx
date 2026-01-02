'use client';

import { useState, useMemo } from 'react';
import { Game } from '@prisma/client';
import { HomeGameCard } from './HomeGameCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

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
      // Ensure "Switch" matches "Nintendo Switch", "Nintendo Switch 2", etc.
      const target = selectedPlatform.toLowerCase();

      return platforms.some((p) => {
        if (!p.name) return false;
        const name = p.name.toLowerCase();
        if (target === 'switch') {
          return name.includes('switch') || name.includes('nintendo');
        }
        return name.includes(target);
      });
    }).slice(0, 10);
  }, [games, selectedPlatform]);

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed
  // Display previous year in Jan/Feb
  const displayYear = currentMonth < 2 ? currentYear - 1 : currentYear;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Top Rated Games of {displayYear}</h2>
          <Link href={`/search?minScore=85&sortBy=rating&releaseYear=${displayYear}`}>
            <Button variant="ghost" size="sm" className="hidden sm:flex text-muted-foreground hover:text-primary">
              View More <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
        <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform} className="w-full sm:w-auto">
          <TabsList className="w-full flex justify-start overflow-x-auto sm:w-auto sm:overflow-visible bg-zinc-100 dark:bg-zinc-800 no-scrollbar pb-1 sm:pb-0">
            {PLATFORMS.map((platform) => (
              <TabsTrigger key={platform.id} value={platform.id} className="text-xs sm:text-sm flex-shrink-0">
                {platform.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Mobile View More */}
        <Link href={`/search?minScore=85&sortBy=rating&releaseYear=${displayYear}`} className="sm:hidden w-full">
          <Button variant="outline" size="sm" className="w-full text-muted-foreground">
            View More Top Rated
          </Button>
        </Link>
      </div>

      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex space-x-4 p-1">
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
