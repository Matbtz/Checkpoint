import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, ExternalLink, TriangleAlert, Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

interface HLTBCardProps {
  hltbMain: number | null;
  hltbExtra: number | null;
  hltbCompletionist: number | null;
  hltbUrl?: string | null;

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

  targetType?: string; // Main, Extra, 100%
}

export function HLTBCard({
  hltbMain,
  hltbExtra,
  hltbCompletionist,
  hltbUrl,
  usersMain,
  usersMainCount,
  usersExtra,
  usersExtraCount,
  usersCompletionist,
  usersCompletionistCount,
  userPlaytime,
  predictedMain,
  predictedExtra,
  predictedCompletionist,
  targetType = "Main"
}: HLTBCardProps) {
  // If no data at all (neither HLTB nor Predicted nor Users), return null
  const hasHltb = hltbMain || hltbExtra || hltbCompletionist;
  const hasPredicted = predictedMain || predictedExtra || predictedCompletionist;
  const hasUsers = usersMain || usersExtra || usersCompletionist;

  if (!hasHltb && !hasPredicted && !hasUsers) return null;

  // Convert user playtime to hours for comparison
  const userHours = userPlaytime ? Math.round((userPlaytime / 60) * 10) / 10 : 0;

  // Decision Logic: Which value to show?
  const USER_THRESHOLD = 3;

  const resolveTime = (hltb: number | null, users: number | null, count: number | null, pred: number | null, sourceLabel: string) => {
    let val = 0;
    let label = "";
    let secondary = null;

    if (users && count && count > USER_THRESHOLD) {
      val = users / 60;
      label = "Community Average";
      if (hltb) secondary = `HLTB: ${Math.round(hltb)}h`;
    }
    else if (hltb) {
      val = hltb;
      label = "HowLongToBeat";
      if (users && count) secondary = `Users: ${Math.round(users / 60)}h (${count})`;
    }
    else if (pred) {
      val = pred;
      label = "Predictive Model";
    }
    else if (users) {
      val = users / 60;
      label = `Community (${count})`;
    }

    return { val, label, secondary };
  };

  const mainData = resolveTime(hltbMain, usersMain || null, usersMainCount || null, predictedMain || null, "Main");
  const extraData = resolveTime(hltbExtra, usersExtra || null, usersExtraCount || null, predictedExtra || null, "Extra");
  const compData = resolveTime(hltbCompletionist, usersCompletionist || null, usersCompletionistCount || null, predictedCompletionist || null, "100%");

  // Reference based on targetType
  const normalizedTarget = (targetType || "Main").toLowerCase();
  let referenceTime = 0;

  if (normalizedTarget === '100%' || normalizedTarget === 'completionist') {
    referenceTime = compData.val;
  } else if (normalizedTarget === 'extra' || normalizedTarget === 'main + extra') {
    referenceTime = extraData.val;
  } else {
    referenceTime = mainData.val;
  }

  // Fallback if selected target has no data, default to Main?
  // Or keep 0 to show "Unknown"?
  // Usually Main is the baseline. If user selected Extra but Extra is missing, maybe fallback to Main?
  // For now strict adherence to target, unless 0, then maybe try Main as backup?
  if (referenceTime === 0 && mainData.val > 0) {
    referenceTime = mainData.val;
  }

  const progressPercent = referenceTime > 0
    ? (userHours / referenceTime) * 100
    : 0;

  const isCompleted = progressPercent >= 100;
  const isOverLimit = progressPercent > 130;

  const renderTimeBlock = (title: string, data: { val: number, label: string, secondary: string | null }, isSelected: boolean) => {
    if (!data.val) return (
      <div className={cn("flex flex-col gap-1 p-2 rounded-lg min-h-[80px] justify-center relative overflow-hidden transition-colors", isSelected ? "bg-purple-500/10 border border-purple-500/30" : "bg-zinc-100 dark:bg-zinc-800/50")}>
        <span className="text-xs text-zinc-500 font-medium uppercase">{title}</span>
        <span className="font-bold text-lg text-zinc-300 dark:text-zinc-700">--</span>
      </div>
    );

    return (
      <div className={cn("flex flex-col gap-1 p-2 rounded-lg min-h-[80px] justify-center relative overflow-hidden transition-colors", isSelected ? "bg-purple-500/10 border border-purple-500/30 ring-1 ring-purple-500/20" : "bg-zinc-100 dark:bg-zinc-800/50")}>
        <span className={cn("text-xs font-medium uppercase", isSelected ? "text-purple-600 dark:text-purple-400" : "text-zinc-500")}>{title}</span>

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

  const isMainSelected = normalizedTarget === 'main';
  const isExtraSelected = normalizedTarget === 'extra' || normalizedTarget === 'main + extra';
  const isCompSelected = normalizedTarget === '100%' || normalizedTarget === 'completionist';

  return (
    <Card className="bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200/50 dark:border-zinc-800/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Time To Beat
          </div>
          {hltbUrl && (
            <Link
              href={hltbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-600 transition-colors"
              title="View on HowLongToBeat"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {renderTimeBlock("Main", mainData, isMainSelected)}
          {renderTimeBlock("Extra", extraData, isExtraSelected)}
          {renderTimeBlock("100%", compData, isCompSelected)}
        </div>

        {userHours > 0 && referenceTime > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                Your Progress
                {isOverLimit ? (
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <TriangleAlert className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64 text-xs bg-zinc-900 text-white border-zinc-800 p-2">
                      You have exceeded 130% of the estimated time for {targetType}. Is this the correct goal?
                    </HoverCardContent>
                  </HoverCard>
                ) : isCompleted ? <Check className="w-3.5 h-3.5 text-yellow-500" /> : null}
              </span>
              <span>{userHours}h / {Math.round(referenceTime)}h</span>
            </div>
            {/* Override Shadcn Progress indicator color */}
            <Progress
              value={Math.min(100, progressPercent)}
              className={cn(
                "h-2",
                isCompleted
                  ? "[&>div]:bg-yellow-500"
                  : "[&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-cyan-400"
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
