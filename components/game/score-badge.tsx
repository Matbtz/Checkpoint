import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null | undefined;
  source: "opencritic" | "steam" | "igdb";
  maxScore?: number;
  label?: string;
  icon?: LucideIcon;
  className?: string;
}

export function ScoreBadge({ score, source, maxScore = 100, label, icon: Icon, className }: ScoreBadgeProps) {
  if (score === null || score === undefined) return null;

  let colorClass = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  if (source === "opencritic") {
    if (score >= 84) colorClass = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
    else if (score >= 74) colorClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
    else colorClass = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
  } else if (source === "steam") {
    // Steam scores are usually strictly 0-100, but logic for "Very Positive" etc is handled by caller usually or simple threshold
    if (score >= 70) colorClass = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    else if (score >= 40) colorClass = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
    else colorClass = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
  }

  return (
    <div className={cn("flex items-center justify-between p-3 rounded-lg border", colorClass, className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5" />}
        <span className="text-sm font-medium">{label || (source === "opencritic" ? "OpenCritic" : source === "steam" ? "Steam" : "Score")}</span>
      </div>
      <span className="text-lg font-bold">
        {score}
        {source !== "steam" && <span className="text-xs opacity-60 ml-0.5">/{maxScore}</span>}
        {source === "steam" && <span className="text-xs opacity-60 ml-0.5">%</span>}
      </span>
    </div>
  );
}
