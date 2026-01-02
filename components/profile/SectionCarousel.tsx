import React, { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface SectionCarouselProps {
  title: string;
  viewMoreLink?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SectionCarousel({ title, viewMoreLink, children, action }: SectionCarouselProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">{title}</h2>
          {action}
        </div>
        {viewMoreLink && (
          <Link
            href={viewMoreLink}
            className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            View More <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="relative">
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex space-x-4 p-1">
            {children}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
