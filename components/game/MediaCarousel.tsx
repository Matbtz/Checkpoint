"use client";

import * as React from "react";
import Image from "next/image";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MediaCarouselProps {
  screenshots: string[];
  videos: string[];
  className?: string;
}

export function MediaCarousel({ screenshots, videos, className }: MediaCarouselProps) {
  if (screenshots.length === 0 && videos.length === 0) return null;

  // Combine videos and screenshots. Videos come first.
  const items = [
    ...videos.map((v) => ({ type: "video" as const, src: v })),
    ...screenshots.filter(s => s && s.startsWith('http')).map((s) => ({ type: "image" as const, src: s })),
  ];

  const getVideoId = (url: string) => {
    try {
      if (!url.includes("youtube.com") && !url.includes("youtu.be")) return url;
      const urlObj = new URL(url);
      return urlObj.searchParams.get("v") || url.split("/").pop();
    } catch {
      return url;
    }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      <h3 className="text-xl font-bold">Media</h3>
      <ScrollArea className="w-full whitespace-nowrap rounded-lg">
        <div className="flex w-max space-x-4 pb-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="relative aspect-video w-[300px] md:w-[400px] shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700"
            >
              {item.type === "video" ? (
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${getVideoId(item.src)}`}
                  title="Game Trailer"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0"
                />
              ) : (
                <Image
                  src={item.src}
                  alt={`Screenshot ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 300px, 400px"
                />
              )}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
