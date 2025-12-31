import React from 'react';
import { PlaySession } from '@/types/profile';
import { Progress } from '@/components/ui/progress';

interface RecentPlayCardProps {
  session: PlaySession;
}

export function RecentPlayCard({ session }: RecentPlayCardProps) {
  // Parsing date for display "Il y a X"
  // Since we are mocking, we can use a simpler approach or date-fns
  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `Il y a ${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)}min`;
    if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)}h`;
    return `Il y a ${Math.floor(diffInSeconds / 86400)}j`;
  };

  return (
    <div className="w-[180px] group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
        <img
          src={session.game.coverUrl}
          alt={session.game.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute bottom-0 left-0 right-0">
          <Progress value={session.progressPercent} className="h-1.5 rounded-none rounded-b-md" />
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <h3 className="truncate font-medium text-sm" title={session.game.title}>
          {session.game.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {getTimeAgo(session.lastPlayedAt)} • {session.sessionDuration}
        </p>
      </div>
    </div>
  );
}
