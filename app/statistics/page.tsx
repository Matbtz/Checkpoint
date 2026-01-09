
import { getUserStatistics } from "@/actions/statistics";
import { KPICards } from "@/components/statistics/KPICards";
import { StatusDonut } from "@/components/statistics/StatsCharts";
import { CommunityPercentiles } from "@/components/statistics/CommunityPercentiles";
import { ReleaseYearChart } from "@/components/statistics/AdvancedCharts";
import { TopPlayedGames } from "@/components/statistics/TopPlayedGames";
import { MetricCard } from "@/components/statistics/MetricCard";
import { QualityQuantity } from "@/components/statistics/QualityQuantity";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Statistics | Checkpoint",
  description: "View your gaming habits and library statistics.",
};

export default async function StatisticsPage() {
  const stats = await getUserStatistics();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Statistics</h1>
      </div>

      <KPICards stats={stats} />

      {/* Row 1: Status & Community */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Library Status</CardTitle>
            <CardDescription>Breakdown of your collection state.</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <StatusDonut stats={stats} />
          </CardContent>
        </Card>

        <CommunityPercentiles stats={stats} />
      </div>

      {/* Row 2: Top Played & Release Years */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Played Games</CardTitle>
            <CardDescription>Most played titles (merging DLCs)</CardDescription>
          </CardHeader>
          <CardContent>
            <TopPlayedGames stats={stats} />
          </CardContent>
        </Card>

        <Card className="col-span-4 lg:col-span-4">
          <CardHeader>
            <CardTitle>Release Year Distribution</CardTitle>
            <CardDescription>When were your games released?</CardDescription>
          </CardHeader>
          <CardContent>
            <ReleaseYearChart stats={stats} />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Genres & Platforms */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 lg:col-span-4">
          <CardHeader>
            <CardTitle>Top Genres</CardTitle>
            <CardDescription>Explore your genre preferences</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <MetricCard data={stats.genreStats} title="Genres" />
          </CardContent>
        </Card>

        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Platforms</CardTitle>
            <CardDescription>Your gaming ecosystem</CardDescription>
          </CardHeader>
          <CardContent>
             <MetricCard data={stats.platformStats} title="Platforms" />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Franchises */}
      <div className="grid gap-4">
        <Card>
            <CardHeader>
                <CardTitle>Top Franchises</CardTitle>
                <CardDescription>Your favorite game series</CardDescription>
            </CardHeader>
            <CardContent>
                <MetricCard data={stats.franchiseStats} title="Franchises" />
            </CardContent>
        </Card>
      </div>

      {/* Row 5: Quality vs Quantity */}
      <Card>
        <CardHeader>
          <CardTitle>Quality vs. Quantity</CardTitle>
          <CardDescription>Analyze your playtime habits vs ratings</CardDescription>
        </CardHeader>
        <CardContent>
          <QualityQuantity stats={stats} />
        </CardContent>
      </Card>
    </div>
  );
}
