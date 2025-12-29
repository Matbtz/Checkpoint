import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | string | null;
  type: "opencritic" | "steam" | "igdb";
  className?: string;
}

export function ScoreBadge({ score, type, className }: ScoreBadgeProps) {
  if (score === null || score === undefined) return null;

  let colorClass = "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";

  if (type === "opencritic" || type === "igdb") {
    const numScore = typeof score === "string" ? parseInt(score) : score;
    if (!isNaN(numScore)) {
      if (numScore >= 84) {
        colorClass = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
      } else if (numScore >= 74) {
        colorClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
      }
    }
  }

  return (
    <Badge variant="outline" className={cn("font-bold border", colorClass, className)}>
      {type === "opencritic" && "OpenCritic: "}
      {type === "igdb" && "IGDB: "}
      {type === "steam" && "Steam: "}
      {score}
    </Badge>
  );
}
