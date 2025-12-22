'use client';

import { Game } from '@prisma/client';
import { HomeGameCard } from './HomeGameCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface DiscoverySectionProps {
  title: string;
  games: Game[];
}

export function DiscoverySection({ title, games }: DiscoverySectionProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {games.length > 0 ? (
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex w-max space-x-4 p-1">
            {games.map((game) => (
              <HomeGameCard key={game.id} game={game} />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <div className="flex items-center justify-center h-[150px] w-full bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700">
          <p className="text-zinc-500 text-sm">No games found for this section.</p>
        </div>
      )}
    </div>
  );
}
