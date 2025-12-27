import { Card } from "@/components/ui/card";
import Image from "next/image";

interface MediaGalleryProps {
  screenshots: string[];
  videos: string[];
}

export function MediaGallery({ screenshots, videos }: MediaGalleryProps) {
  if (screenshots.length === 0 && videos.length === 0) return null;

  // We'll show up to 6 items.
  // Prioritize video.
  const hasVideo = videos.length > 0;
  // If video exists, we show it first.

  // Clean screenshots: ensure valid URLs
  const validScreenshots = screenshots.filter(s => s && s.startsWith('http'));

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Media</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {hasVideo && (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black shadow-sm col-span-full md:col-span-2">
                <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${videos[0]}`}
                    title="Game Trailer"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                ></iframe>
            </div>
        )}

        {validScreenshots.map((shot, idx) => (
             // If we have a video taking up space, maybe we show fewer screenshots or organize them differently.
             // For simplicity, just listing them.
             <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-sm group">
                <Image
                    src={shot}
                    alt={`Screenshot ${idx + 1}`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
             </div>
        ))}
      </div>
    </div>
  );
}
