import React from 'react';
import {
  mockUser,
  mockRecentPlays,
  mockUpcoming,
  mockFriendsActivity
} from '@/lib/mock-profile-data';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { SectionCarousel } from '@/components/profile/SectionCarousel';
import { RecentPlayCard } from '@/components/profile/RecentPlayCard';
import { UpcomingCard } from '@/components/profile/UpcomingCard';
import { FriendActivityCard } from '@/components/profile/FriendActivityCard';

export default function ProfilePage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Profile Header */}
      <ProfileHeader user={mockUser} isOwnProfile={true} />

      <div className="container mt-16 space-y-12 px-4 md:px-8">
        {/* Stats Overview */}
        <StatsOverview />

        {/* Latest Plays Carousel */}
        <SectionCarousel title="Latest Plays" viewMoreLink="/profile/history">
          {mockRecentPlays.map((session, index) => (
            <RecentPlayCard key={`${session.game.id}-${index}`} session={session} />
          ))}
        </SectionCarousel>

        {/* Watchlist Carousel */}
        <SectionCarousel title="Upcoming Games" viewMoreLink="/profile/wishlist">
          {mockUpcoming.map((item, index) => (
            <UpcomingCard key={`${item.game.id}-${index}`} item={item} />
          ))}
        </SectionCarousel>

        {/* Friends Activity Carousel */}
        <SectionCarousel title="Friends Activity">
          {mockFriendsActivity.map((activity, index) => (
            <FriendActivityCard key={`${activity.friend.id}-${activity.game.id}-${index}`} activity={activity} />
          ))}
        </SectionCarousel>
      </div>
    </div>
  );
}
