import React from 'react';
import Link from 'next/link';
import { UpcomingGame } from '@/types/profile';
import { Badge } from '@/components/ui/badge';
import { differenceInDays, format } from 'date-fns';

interface UpcomingCardProps {
  item: UpcomingGame;
  inWishlist?: boolean;
}

export function UpcomingCard({ item, inWishlist = true }: UpcomingCardProps) {
  const releaseDate = new Date(item.releaseDate);
  const daysUntilRelease = differenceInDays(releaseDate, new Date());

  const isComingSoon = daysUntilRelease >= 0 && daysUntilRelease <= 7;
  const isReleased = daysUntilRelease < 0;

  return (
    <Link href={`/game/${item.game.id}`}>
      <div className="w-[180px] group cursor-pointer">
        <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
          <img
            src={item.game.coverUrl}
            alt={item.game.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {inWishlist && (
            <Badge
              variant="secondary"
              className="absolute right-2 top-2 shadow-sm opacity-90 backdrop-blur-sm"
            >
              Wishlist
            </Badge>
          )}
        </div>
        <div className="mt-2 space-y-1">
          <h3 className="truncate font-medium text-sm" title={item.game.title}>
            {item.game.title}
          </h3>
          <p className={`text-xs ${isComingSoon ? 'text-green-600 font-semibold' : 'text-muted-foreground'}`}>
            {isComingSoon
              ? `Dans ${daysUntilRelease} jours`
              : format(releaseDate, 'dd/MM/yyyy')}
          </p>
        </div>
      </div>
    </Link>
  );
}
