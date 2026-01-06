"use client";

import { useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoCardProps {
    url: string;
    className?: string;
}

export function VideoCard({ url, className }: VideoCardProps) {
    const [isPlaying, setIsPlaying] = useState(false);

    const getVideoId = (url: string) => {
        try {
            if (!url.includes("youtube.com") && !url.includes("youtu.be")) return url;
            const urlObj = new URL(url);
            return urlObj.searchParams.get("v") || url.split("/").pop();
        } catch {
            return url;
        }
    };

    const videoId = getVideoId(url);
    const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    if (isPlaying) {
        return (
            <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
                title="Game Trailer"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className={cn("w-full h-full", className)}
            />
        );
    }

    return (
        <div
            className={cn("relative w-full h-full cursor-pointer group", className)}
            onClick={() => setIsPlaying(true)}
        >
            <Image
                src={thumbnailUrl}
                alt="Video Thumbnail"
                fill
                className="object-cover transition-opacity group-hover:opacity-90"
                sizes="(max-width: 768px) 300px, 400px"
            />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-sm group-hover:bg-red-600/80 transition-colors shadow-lg border border-white/20">
                    <Play className="w-6 h-6 md:w-8 md:h-8 text-white fill-white ml-1" />
                </div>
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded-md md:text-sm font-medium">
                Video
            </div>
        </div>
    );
}
