import React from 'react';
import { FriendActivity } from '@/types/profile';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';

interface FriendActivityCardProps {
  activity: FriendActivity;
}

export function FriendActivityCard({ activity }: FriendActivityCardProps) {
  return (
    <div className="w-[180px] group cursor-pointer">
      <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-muted">
        <img
          src={activity.game.coverUrl}
          alt={activity.game.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Friend Avatar Overlay */}
        <div className="absolute bottom-2 right-2">
           <Avatar className="h-8 w-8 border-2 border-background shadow-md">
            <AvatarImage src={activity.friend.avatarUrl} alt={activity.friend.username} />
            <AvatarFallback>{activity.friend.username.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="mt-2 space-y-1">
        <Link href={`/u/${activity.friend.id}`} className="block">
          <h3 className="truncate font-medium text-sm hover:underline" title={activity.friend.username}>
            {activity.friend.username}
          </h3>
        </Link>
        <Link href={`/game/${activity.game.slug}`} className="block">
           <p className="truncate text-xs text-muted-foreground hover:text-foreground transition-colors" title={activity.game.title}>
             {activity.game.title}
           </p>
        </Link>
      </div>
    </div>
  );
}
