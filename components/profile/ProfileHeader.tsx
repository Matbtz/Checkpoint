import React from 'react';
import { User } from '@/types/profile';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Settings } from 'lucide-react';

interface ProfileHeaderProps {
  user: User;
  isOwnProfile?: boolean;
}

export function ProfileHeader({ user, isOwnProfile = false }: ProfileHeaderProps) {
  return (
    <div className="relative h-[300px] w-full">
      {/* Background Image */}
      <img
        src={user.profileBackgroundUrl}
        alt="Profile Background"
        className="h-full w-full object-cover"
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />

      {/* Settings Link */}
      {isOwnProfile && (
        <Link href="/settings" className="absolute right-4 top-4">
          <Button
            variant="ghost"
            size="icon"
            className="bg-background/50 backdrop-blur-sm hover:bg-background/80 text-foreground"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      )}

      {/* Avatar */}
      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 transform">
        <Avatar className="h-32 w-32 border-4 border-background">
          <AvatarImage src={user.avatarUrl} alt={user.username} className="object-cover" />
          <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
