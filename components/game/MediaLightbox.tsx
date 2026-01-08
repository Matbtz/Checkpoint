"use client";

import * as React from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogClose, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaItem {
  src: string;
  type: "image" | "video";
}

interface MediaLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  items: MediaItem[];
  initialIndex: number;
}

export function MediaLightbox({ isOpen, onClose, items, initialIndex }: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);

  // Sync index if initialIndex changes when reopening (though Dialog usually unmounts/remounts logic depends on usage)
  React.useEffect(() => {
      if (isOpen) {
        setCurrentIndex(initialIndex);
      }
  }, [isOpen, initialIndex]);

  const handlePrevious = React.useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  }, [items.length]);

  const handleNext = React.useCallback(() => {
    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  }, [items.length]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevious();
      if (e.key === "ArrowRight") handleNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handlePrevious, handleNext]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] h-[90vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center outline-none">
        <DialogTitle className="sr-only">Media View</DialogTitle>
        <DialogDescription className="sr-only">Full size view of the selected media</DialogDescription>

        <div className="relative w-full h-full flex items-center justify-center group">
          <DialogClose className="absolute top-4 right-4 z-50 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 focus:outline-none transition-opacity">
            <X className="h-6 w-6" />
          </DialogClose>

          {/* Navigation Buttons */}
          {items.length > 1 && (
            <>
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 md:left-4 z-50 rounded-full bg-black/30 hover:bg-black/60 text-white h-12 w-12 hidden md:flex"
                    onClick={handlePrevious}
                >
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 md:right-4 z-50 rounded-full bg-black/30 hover:bg-black/60 text-white h-12 w-12 hidden md:flex"
                    onClick={handleNext}
                >
                    <ChevronRight className="h-8 w-8" />
                </Button>
            </>
          )}

          {currentItem.type === "image" ? (
            <div className="relative w-full h-full max-w-full max-h-full">
              <Image
                src={currentItem.src}
                alt={`Media ${currentIndex + 1}`}
                fill
                className="object-contain"
                sizes="95vw"
                priority
              />
            </div>
          ) : (
            <iframe
              src={currentItem.src}
              className="w-full h-full max-w-[1280px] max-h-[720px] aspect-video rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {/* Counter (optional) */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
            {currentIndex + 1} / {items.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
