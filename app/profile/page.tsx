import React from 'react';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { StatsOverview } from '@/components/profile/StatsOverview';
import { SectionCarousel } from '@/components/profile/SectionCarousel';
import { RecentPlayCard } from '@/components/profile/RecentPlayCard';
import { UpcomingCard } from '@/components/profile/UpcomingCard';
import { FriendActivityCard } from '@/components/profile/FriendActivityCard';
import { AddFriendDialog } from '@/components/profile/AddFriendDialog';
import { getUserProfileData } from '@/actions/profile';
import { getUserStatistics } from '@/actions/statistics';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

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
        <SectionCarousel title="Upcoming Games" viewMoreLink="/library?status=WISHLIST">
            {upcomingGames.length > 0 ? (
                upcomingGames.map((item, index) => (
                  <UpcomingCard key={`${item.game.id}-${index}`} item={item} />
                ))
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 w-full bg-muted/30 rounded-lg border border-dashed">
                    <p className="text-muted-foreground">Your wishlist is empty.</p>
                    <Link href="/search?releaseDateModifier=next_year&sortBy=release_asc">
                        <Button variant="outline" className="gap-2">
                            <Search className="h-4 w-4" />
                            Explore upcoming games
                        </Button>
                    </Link>
                </div>
            )}
        </SectionCarousel>

        {/* Friends Activity Carousel */}
        <SectionCarousel title="Friends Activity" action={<AddFriendDialog />}>
            {friendActivities.length > 0 ? (
                friendActivities.map((activity, index) => (
                  <FriendActivityCard key={`${activity.friend.id}-${activity.game.id}-${index}`} activity={activity} />
                ))
            ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 w-full bg-muted/30 rounded-lg border border-dashed">
                    <p className="text-muted-foreground">Add friends to see their activity!</p>
                </div>
            )}
        </SectionCarousel>
      </div>
    </div>
  );
}
