import React from 'react';
import { User } from '@/types/profile';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Settings } from 'lucide-react';

import { EditProfileDialog } from '@/components/profile/EditProfileDialog';

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
        className="h-full w-full object-cover text-transparent"
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background to-transparent" />

      {/* Settings Button (Mobile) */}
      {isOwnProfile && (
        <div className="absolute left-4 top-4 z-10 md:hidden">
          <Link href="/settings">
            <Button variant="secondary" size="icon" className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white border-0">
               <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* Edit Profile Button */}
      {isOwnProfile && (
        <div className="absolute right-4 top-4 z-10">
          <EditProfileDialog
            currentAvatarUrl={user.avatarUrl}
            currentBackgroundUrl={user.profileBackgroundUrl || ""}
            currentBackgroundMode={user.profileBackgroundMode}
            currentBackgroundGameId={user.profileBackgroundGameId}
          />
        </div>
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
