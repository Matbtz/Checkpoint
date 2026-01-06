import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

interface RatingsSectionProps {
  opencriticScore?: number | null;
  igdbScore?: number | null;
  steamReviewScore?: string | null;
  steamReviewPercent?: number | null;
  steamUrl?: string | null;
  igdbUrl?: string | null;
  opencriticUrl?: string | null;
}

export function RatingsSection({
  opencriticScore,
  igdbScore,
  steamReviewScore,
  steamReviewPercent,
  steamUrl,
  igdbUrl,
  opencriticUrl,
}: RatingsSectionProps) {
  const hasRatings = opencriticScore || igdbScore || steamReviewScore || igdbUrl;

  if (!hasRatings) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Ratings</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {/* OpenCritic */}
        {opencriticScore && (
          opencriticUrl ? (
            <a
              href={opencriticUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "group block p-6 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98]",
                "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800",
                opencriticScore >= 84
                  ? "hover:border-green-500/50 hover:bg-green-50/50 dark:hover:bg-green-950/20"
                  : opencriticScore >= 74
                    ? "hover:border-yellow-500/50 hover:bg-yellow-50/50 dark:hover:bg-yellow-950/20"
                    : "hover:border-zinc-400"
              )}
            >
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  OpenCritic <ExternalLink className="w-3 h-3 opacity-50" />
                </span>
                <span
                  className={cn(
                    "text-4xl font-black",
                    opencriticScore >= 84
                      ? "text-green-600 dark:text-green-400"
                      : opencriticScore >= 74
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {opencriticScore}
                </span>
              </div>
            </a>
          ) : (
            <div
              className={cn(
                "block p-6 rounded-xl border",
                "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              )}
            >
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  OpenCritic
                </span>
                <span
                  className={cn(
                    "text-4xl font-black",
                    opencriticScore >= 84
                      ? "text-green-600 dark:text-green-400"
                      : opencriticScore >= 74
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-zinc-700 dark:text-zinc-300"
                  )}
                >
                  {opencriticScore}
                </span>
              </div>
            </div>
          )
        )}

        {/* IGDB */}
        {(igdbScore || igdbUrl) && (
          igdbUrl ? (
            <a
              href={igdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-purple-500/50 hover:bg-purple-50/50 dark:hover:bg-purple-950/20"
            >
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  IGDB <ExternalLink className="w-3 h-3 opacity-50" />
                </span>
                <span className="text-4xl font-black text-purple-600 dark:text-purple-400">
                  {igdbScore || "--"}
                </span>
              </div>
            </a>
          ) : (
            <div className="block p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  IGDB
                </span>
                <span className="text-4xl font-black text-purple-600 dark:text-purple-400">
                  {igdbScore || "--"}
                </span>
              </div>
            </div>
          )
        )}

        {/* Steam */}
        {steamReviewScore && (
          steamUrl ? (
            <a
              href={steamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group block p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
            >
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  Steam <ExternalLink className="w-3 h-3 opacity-50" />
                </span>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-tight">
                    {steamReviewScore}
                  </span>
                  {steamReviewPercent && (
                    <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                      {steamReviewPercent}%
                    </span>
                  )}
                </div>
              </div>
            </a>
          ) : (
            <div className="block p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="flex flex-col items-center justify-center space-y-2 text-center h-full">
                <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  Steam
                </span>
                <div className="flex flex-col items-center">
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400 leading-tight">
                    {steamReviewScore}
                  </span>
                  {steamReviewPercent && (
                    <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                      {steamReviewPercent}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
