"use client";

import * as React from "react";
import Image from "next/image";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { VideoCard } from "./VideoCard";
import { MediaLightbox } from "./MediaLightbox";
import { Play } from "lucide-react";

interface MediaCarouselProps {
  screenshots: string[];
  videos: string[];
  className?: string;
  title?: string;
}

export function MediaCarousel({ screenshots, videos, className, title = "Media" }: MediaCarouselProps) {
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [selectedMedia, setSelectedMedia] = React.useState<{ src: string, type: "image" | "video" } | null>(null);

  if (screenshots.length === 0 && videos.length === 0) return null;

  // Combine videos and screenshots. Videos come first.
  const items = [
    ...videos.map((v) => ({ type: "video" as const, src: v })),
    ...screenshots.filter(s => s && s.startsWith('http')).map((s) => ({ type: "image" as const, src: s })),
  ];

  const handleMediaClick = (item: { src: string, type: "image" | "video" }) => {
      // For videos, VideoCard might handle interactions, but if we want a lightbox for it too:
      // Note: VideoCard currently likely renders an iframe or direct video player.
      // If it's an iframe, clicking it might just play it inside the card.
      // We might want an overlay to intercept click?
      // For images, definitely lightbox.
      if (item.type === "image") {
          setSelectedMedia(item);
          setLightboxOpen(true);
      } else {
         // Optional: Do we want to lightbox videos?
         // User asked "allow screenshots to be clicked to see them in a large format".
         // I'll prioritize screenshots. Videos usually play inline.
         // But I'll enable it for videos if they want.
         // Let's stick to images for now based on "screenshots to be clicked".
         // Actually, if it's a small carousel, viewing video large is good too.
         // But typical YouTube embeds handle fullscreen.
      }
  };

  return (
    <div className={cn("w-full space-y-4", className)}>
      <h3 className="text-xl font-bold">{title}</h3>
      <ScrollArea className="w-full whitespace-nowrap rounded-lg">
        <div className="flex w-max space-x-4 pb-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                  "relative aspect-video w-[300px] md:w-[400px] shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-zinc-700 group",
                  item.type === "image" ? "cursor-pointer" : ""
              )}
              onClick={() => handleMediaClick(item)}
            >
              {item.type === "video" ? (
                <VideoCard url={item.src} className="absolute inset-0" />
              ) : (
                <>
                    <Image
                    src={item.src}
                    alt={`Screenshot ${idx + 1}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 300px, 400px"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </>
              )}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {selectedMedia && (
        <MediaLightbox
            isOpen={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            src={selectedMedia.src}
            type={selectedMedia.type}
        />
      )}
    </div>
  );
}
