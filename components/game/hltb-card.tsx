import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface HLTBCardProps {
  hltbMain: number | null;
  hltbExtra: number | null;
  hltbCompletionist: number | null;
  userPlaytimeMinutes?: number | null;
  className?: string;
}

export function HLTBCard({ hltbMain, hltbExtra, hltbCompletionist, userPlaytimeMinutes, className }: HLTBCardProps) {
  const hasData = hltbMain || hltbExtra || hltbCompletionist;

  if (!hasData) return null;

  const formatTime = (minutes: number | null) => {
    if (!minutes) return "--";
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  };

  const userPlaytimeHours = userPlaytimeMinutes ? Math.round(userPlaytimeMinutes / 60) : 0;
  // If we have hltbMain, calculate progress relative to it (capped at 100 for visual sanity, or maybe show overflow)
  // Let's cap at 100 for the bar, but text shows real value.
  const referenceTime = (hltbMain && hltbMain > 0) ? (hltbMain / 60) : 0;
  const progressPercent = referenceTime > 0 ? Math.min(100, (userPlaytimeHours / referenceTime) * 100) : 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3 bg-zinc-50 dark:bg-zinc-900 border-b">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Time To Beat
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-semibold">Main</div>
            <div className="text-xl font-bold font-mono tracking-tight">{formatTime(hltbMain)}</div>
          </div>
          <div className="space-y-1 border-x border-zinc-100 dark:border-zinc-800">
            <div className="text-xs text-muted-foreground uppercase font-semibold">Extra</div>
            <div className="text-xl font-bold font-mono tracking-tight">{formatTime(hltbExtra)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground uppercase font-semibold">100%</div>
            <div className="text-xl font-bold font-mono tracking-tight">{formatTime(hltbCompletionist)}</div>
          </div>
        </div>

        {userPlaytimeMinutes !== undefined && userPlaytimeMinutes !== null && userPlaytimeMinutes > 0 && (
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">Your Playtime</span>
              <span className="font-bold">{userPlaytimeHours}h</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
            {referenceTime > 0 && (
                <p className="text-[10px] text-muted-foreground text-center">
                    {progressPercent >= 100 ? "You've passed the average!" : `${Math.round(progressPercent)}% of Main Story average`}
                </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
