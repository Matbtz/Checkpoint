
"use client";

import { UserStatistics } from "@/actions/statistics";
import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopPlayedGamesProps {
  stats: UserStatistics;
}

export function TopPlayedGames({ stats }: TopPlayedGamesProps) {
  const [page, setPage] = useState(0);
  const itemsPerPage = 5;
  const totalPages = Math.ceil(stats.topPlayed.length / itemsPerPage);

  const currentItems = stats.topPlayed.slice(
    page * itemsPerPage,
    (page + 1) * itemsPerPage
  );

  const handlePrev = () => {
    setPage((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setPage((prev) => Math.min(totalPages - 1, prev + 1));
  };

  if (stats.topPlayed.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No playtime data
      </div>
    );
  }

  // Calculate global max for progress bar scaling (always relative to the #1 game overall)
  const maxMinutes = stats.topPlayed[0]?.minutes || 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 min-h-[300px]">
        {currentItems.map((game, i) => {
          const globalIndex = page * itemsPerPage + i;
          return (
            <div key={game.id} className="flex items-center gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="relative h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
                {game.image && (
                  <Image
                    src={game.image}
                    alt={game.title}
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                )}
                <div className="absolute inset-0 bg-black/10" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                  <span className="text-[10px] font-bold text-white">
                    #{globalIndex + 1}
                  </span>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-1 overflow-hidden">
                <span className="truncate text-sm font-medium">{game.title}</span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{
                      width: `${(game.minutes / maxMinutes) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="w-16 text-right text-xs text-muted-foreground">
                {game.hours}h
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrev}
          disabled={page === 0}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page + 1} of {totalPages || 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNext}
          disabled={page >= totalPages - 1}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
