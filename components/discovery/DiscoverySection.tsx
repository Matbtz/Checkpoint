'use client';

import { Game } from '@prisma/client';
import { HomeGameCard } from './HomeGameCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface DiscoverySectionProps {
  title: string;
  games: Game[];
}

export function DiscoverySection({ title, games }: DiscoverySectionProps) {
  if (games.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <ScrollArea className="w-full whitespace-nowrap pb-4">
        <div className="flex w-max space-x-4 p-1">
          {games.map((game) => (
            <HomeGameCard key={game.id} game={game} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
