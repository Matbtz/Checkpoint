import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface HLTBCardProps {
  hltbMain: number | null;
  hltbExtra: number | null;
  hltbCompletionist: number | null;

  usersMain?: number | null;
  usersMainCount?: number | null;
  usersExtra?: number | null;
  usersExtraCount?: number | null;
  usersCompletionist?: number | null;
  usersCompletionistCount?: number | null;

  userPlaytime?: number | null; // In minutes
  predictedMain?: number | null; // In hours
  predictedExtra?: number | null; // In hours
  predictedCompletionist?: number | null; // In hours
}

export function HLTBCard({
  hltbMain,
  hltbExtra,
  hltbCompletionist,
  usersMain,
  usersMainCount,
  usersExtra,
  usersExtraCount,
  usersCompletionist,
  usersCompletionistCount,
  userPlaytime,
  predictedMain,
  predictedExtra,
  predictedCompletionist
}: HLTBCardProps) {
  // If no data at all (neither HLTB nor Predicted nor Users), return null
  const hasHltb = hltbMain || hltbExtra || hltbCompletionist;
  const hasPredicted = predictedMain || predictedExtra || predictedCompletionist;
  const hasUsers = usersMain || usersExtra || usersCompletionist;

  if (!hasHltb && !hasPredicted && !hasUsers) return null;

  // Convert user playtime to hours for comparison
  const userHours = userPlaytime ? Math.round((userPlaytime / 60) * 10) / 10 : 0;

  // Decision Logic: Which value to show?
  // Threshold for using User data over HLTB: > 3 submissions
  const USER_THRESHOLD = 3;

  const resolveTime = (hltb: number | null, users: number | null, count: number | null, pred: number | null, sourceLabel: string) => {
    let val = 0;
    let label = "";
    let secondary = null;

    // 1. Crowdsourced (if enough data)
    if (users && count && count > USER_THRESHOLD) {
      val = users / 60;
      label = "Community Average";
      if (hltb) secondary = `HLTB: ${Math.round(hltb / 60)}h`;
    }
    // 2. HLTB (Primary source if no community data)
    else if (hltb) {
      val = hltb / 60;
      label = "HowLongToBeat";
      if (users && count) secondary = `Users: ${Math.round(users / 60)}h (${count})`;
    }
    // 3. Predicted (Fallback)
    else if (pred) {
      val = pred;
      label = "Predictive Model";
    }
    // 4. Crowdsourced (Low confidence fallback)
    else if (users) {
      val = users / 60;
      label = `Community (${count})`;
    }

    return { val, label, secondary };
  };

  const mainData = resolveTime(hltbMain, usersMain || null, usersMainCount || null, predictedMain || null, "Main");
  const extraData = resolveTime(hltbExtra, usersExtra || null, usersExtraCount || null, predictedExtra || null, "Extra");
  const compData = resolveTime(hltbCompletionist, usersCompletionist || null, usersCompletionistCount || null, predictedCompletionist || null, "100%");

  // Reference for progress bar (prioritize Main)
  const referenceTime = mainData.val || extraData.val || compData.val || 0;

  const progressPercent = referenceTime > 0
    ? Math.min(100, (userHours / referenceTime) * 100)
    : 0;

  const renderTimeBlock = (title: string, data: { val: number, label: string, secondary: string | null }) => {
    if (!data.val) return (
      <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 min-h-[80px] justify-center relative overflow-hidden">
        <span className="text-xs text-zinc-500 font-medium uppercase">{title}</span>
        <span className="font-bold text-lg text-zinc-300 dark:text-zinc-700">--</span>
      </div>
    );

    return (
      <div className="flex flex-col gap-1 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 min-h-[80px] justify-center relative overflow-hidden">
        <span className="text-xs text-zinc-500 font-medium uppercase">{title}</span>

        <div className="flex flex-col items-center">
          <span className="font-bold text-lg">{Math.round(data.val)}h</span>
          <span className="text-[10px] text-zinc-400 leading-tight px-1 text-center">
            {data.label}
          </span>
          {data.secondary && (
            <span className="text-[9px] text-zinc-500/70 mt-0.5" title={data.secondary}>
              {data.secondary}
            </span>
          )}
        </div>
      </div>
    );
  };

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
          {renderTimeBlock("Main", mainData)}
          {renderTimeBlock("Extra", extraData)}
          {renderTimeBlock("100%", compData)}
        </div>

        {userHours > 0 && referenceTime > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-zinc-600 dark:text-zinc-400">Your Progress</span>
              <span>{userHours}h / {Math.round(referenceTime)}h</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
