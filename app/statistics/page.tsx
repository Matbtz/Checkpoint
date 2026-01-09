import { getUserStatistics } from "@/actions/statistics";
import { KPICards } from "@/components/statistics/KPICards";
import {
  StatusDonut,
  TopPlayedList,
  GenresBarChart,
  PlatformsBarChart,
} from "@/components/statistics/StatsCharts";
import { CommunityPercentiles } from "@/components/statistics/CommunityPercentiles";
import { ReleaseYearChart, ScoreVsPlaytimeChart } from "@/components/statistics/AdvancedCharts";
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
            <CardTitle>Top 5 Most Played</CardTitle>
          </CardHeader>
          <CardContent>
            <TopPlayedList stats={stats} />
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
          </CardHeader>
          <CardContent className="pl-2">
            <GenresBarChart stats={stats} />
          </CardContent>
        </Card>

        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle>Top Platforms (Owned)</CardTitle>
            <CardDescription>Based on your owned platforms.</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformsBarChart stats={stats} />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Scatter Plot */}
      <Card>
        <CardHeader>
          <CardTitle>Quality vs. Quantity</CardTitle>
          <CardDescription>Do you spend more time on higher rated games?</CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreVsPlaytimeChart stats={stats} />
        </CardContent>
      </Card>
    </div>
  );
}


