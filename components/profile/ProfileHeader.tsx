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

      {/* Edit Profile Button */}
      {isOwnProfile && (
        <div className="absolute right-4 top-4 z-10">
          <EditProfileDialog
            currentAvatarUrl={user.avatarUrl}
            currentBackgroundUrl={user.profileBackgroundUrl || ""}
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
