import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import Image from "next/image";

interface MediaGalleryProps {
  screenshots: string[];
  videos?: string[];
  title: string;
}

export function MediaGallery({ screenshots, videos, title }: MediaGalleryProps) {
  if (!screenshots || screenshots.length === 0) return null;

  // Prioritize video as first item if available
  const mainVideo = videos && videos.length > 0 ? videos[0] : null;
  const displayScreenshots = screenshots.slice(0, 6);

  // Helper to extract YouTube ID
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Media</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {mainVideo && (() => {
            const videoId = getYoutubeId(mainVideo);
            return videoId ? (
                <div className="col-span-2 aspect-video relative rounded-lg overflow-hidden bg-black shadow-lg group cursor-pointer">
                    <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0"
                    />
                </div>
            ) : null;
        })()}

        {displayScreenshots.map((src, i) => (
          <Dialog key={i}>
            <DialogTrigger asChild>
              <div className="relative aspect-video rounded-lg overflow-hidden cursor-zoom-in hover:opacity-90 transition-opacity bg-zinc-100 dark:bg-zinc-800">
                <Image
                    src={src}
                    alt={`${title} screenshot ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 33vw"
                />
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-full p-0 bg-black border-none overflow-hidden aspect-video">
                <div className="relative w-full h-full">
                     <Image
                        src={src}
                        alt={`${title} screenshot ${i + 1}`}
                        fill
                        className="object-contain"
                        quality={100}
                    />
                </div>
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </div>
  );
}
