'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Stat {
  label: string;
  value: string | number;
}

interface StatsOverviewProps {
  stats?: Stat[];
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  // Default mock stats if none provided
  const displayStats = stats || [
    { label: 'Total Games', value: 124 },
    { label: 'Hours Played', value: '1.2k' },
    { label: 'Now Playing', value: 3 },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {displayStats.map((stat, index) => (
        <Link href="/profile/stats" key={index} className="block">
          <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full">
            <CardContent className="flex flex-col items-center justify-center py-6 text-center">
              <span className="text-3xl font-bold">{stat.value}</span>
              <span className="text-sm text-muted-foreground mt-1">{stat.label}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
