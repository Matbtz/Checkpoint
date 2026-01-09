import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserStatistics } from "@/actions/statistics";
import { Clock, Gamepad2, Trophy, Cable } from "lucide-react";

interface KPICardsProps {
  stats: UserStatistics;
}

export function KPICards({ stats }: KPICardsProps) {
  const completionRate = stats.counts.totalGames > 0
    ? Math.round((stats.counts.completed / stats.counts.totalGames) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Playtime</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.time.totalHours}h</div>
          <p className="text-xs text-muted-foreground">
            {stats.time.totalDays} days of gameplay
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Library Size</CardTitle>
          <Gamepad2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.counts.totalGames}</div>
          <p className="text-xs text-muted-foreground">
            Games in collection
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          <Trophy className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completionRate}%</div>
          <p className="text-xs text-muted-foreground">
            {stats.counts.completed} completed games
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Steam Integration</CardTitle>
          <Cable className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.counts.steamImported}</div>
          <p className="text-xs text-muted-foreground">
            Games linked to Steam
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
