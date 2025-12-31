import React from 'react';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { SectionCarousel } from '@/components/profile/SectionCarousel';
import { RecentPlayCard } from '@/components/profile/RecentPlayCard';
import { UpcomingCard } from '@/components/profile/UpcomingCard';
import { FriendActivityCard } from '@/components/profile/FriendActivityCard';
import { getUserProfileData } from '@/actions/profile';
import { getUserStatistics } from '@/actions/statistics';

export default async function ProfilePage() {
  const [profileData, statsData] = await Promise.all([
    getUserProfileData(),
    getUserStatistics()
  ]);

  const { user, recentPlays, upcomingGames, friendActivities } = profileData;

  // Transform stats for StatsOverview
  const displayStats = [
    { label: 'Total Games', value: statsData.counts.totalGames },
    { label: 'Hours Played', value: statsData.time.totalHours },
    { label: 'Now Playing', value: statsData.counts.playing },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Profile Header */}
      <ProfileHeader user={user} isOwnProfile={true} />

      <div className="container mt-16 space-y-12 px-4 md:px-8">
        {/* Stats Overview */}
        <StatsOverview stats={displayStats} />

        {/* Latest Plays Carousel */}
        {recentPlays.length > 0 && (
          <SectionCarousel title="Latest Plays" viewMoreLink="/library">
            {recentPlays.map((session, index) => (
              <RecentPlayCard key={`${session.game.id}-${index}`} session={session} />
            ))}
          </SectionCarousel>
        )}

        {/* Watchlist Carousel */}
        {upcomingGames.length > 0 && (
          <SectionCarousel title="Upcoming Games" viewMoreLink="/library?status=WISHLIST">
            {upcomingGames.map((item, index) => (
              <UpcomingCard key={`${item.game.id}-${index}`} item={item} />
            ))}
          </SectionCarousel>
        )}

        {/* Friends Activity Carousel */}
        {friendActivities.length > 0 && (
          <SectionCarousel title="Friends Activity">
            {friendActivities.map((activity, index) => (
              <FriendActivityCard key={`${activity.friend.id}-${activity.game.id}-${index}`} activity={activity} />
            ))}
          </SectionCarousel>
        )}
      </div>
    </div>
  );
}
