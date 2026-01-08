"use client";

import * as React from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogClose, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X } from "lucide-react";

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  type: "image" | "video";
}

export function MediaLightbox({ isOpen, onClose, src, type }: MediaLightboxProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[90vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center">
        <DialogTitle className="sr-only">Media View</DialogTitle>
        <DialogDescription className="sr-only">Full size view of the selected media</DialogDescription>

        <div className="relative w-full h-full flex items-center justify-center">
          <DialogClose className="absolute top-4 right-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 focus:outline-none">
            <X className="h-6 w-6" />
          </DialogClose>

          {type === "image" ? (
            <div className="relative w-full h-full max-w-full max-h-full">
              <Image
                src={src}
                alt="Full size media"
                fill
                className="object-contain"
                sizes="95vw"
                priority
              />
            </div>
          ) : (
            <iframe
              src={src} // Assuming embedded video URL logic from VideoCard is handled or passed correctly
              className="w-full h-full max-w-[1280px] max-h-[720px] aspect-video rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
