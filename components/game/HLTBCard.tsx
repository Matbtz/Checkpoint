import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface HLTBCardProps {
  hltbMain: number | null;
  hltbExtra: number | null;
  hltbCompletionist: number | null;
  userPlaytime?: number | null; // In minutes
}

export function HLTBCard({ hltbMain, hltbExtra, hltbCompletionist, userPlaytime }: HLTBCardProps) {
  if (!hltbMain && !hltbExtra && !hltbCompletionist) return null;

  // Convert user playtime to hours for comparison
  const userHours = userPlaytime ? Math.round((userPlaytime / 60) * 10) / 10 : 0;

  // Calculate percentage of main story completed (capped at 100)
  const progressPercent = hltbMain
    ? Math.min(100, (userHours / hltbMain) * 100)
    : 0;

  return (
    <Card className="bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          <Clock className="w-4 h-4" />
          Time To Beat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <span className="text-xs text-zinc-500 font-medium uppercase">Main</span>
            <span className="font-bold text-lg">{hltbMain || "--"}h</span>
          </div>
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <span className="text-xs text-zinc-500 font-medium uppercase">Extra</span>
            <span className="font-bold text-lg">{hltbExtra || "--"}h</span>
          </div>
          <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <span className="text-xs text-zinc-500 font-medium uppercase">100%</span>
            <span className="font-bold text-lg">{hltbCompletionist || "--"}h</span>
          </div>
        </div>

        {userHours > 0 && hltbMain && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-zinc-600 dark:text-zinc-400">Your Progress</span>
              <span>{userHours}h / {hltbMain}h</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
