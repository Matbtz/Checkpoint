"use client";

import { UserStatistics } from "@/actions/statistics";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import Image from "next/image";

interface StatsChartsProps {
  stats: UserStatistics;
}

export function StatusDonut({ stats }: StatsChartsProps) {
  // If no data, show a placeholder or empty state handling
  if (stats.counts.totalGames === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No games in library
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={stats.statusDistribution}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
        >
          {stats.statusDistribution.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", color: "#fff" }}
          itemStyle={{ color: "#fff" }}
        />
        <Legend verticalAlign="bottom" height={36} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function TopPlayedList({ stats }: StatsChartsProps) {
  return (
    <div className="space-y-4">
      {stats.topPlayed.map((game, i) => (
        <div key={game.id} className="flex items-center gap-4">
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
              <span className="text-[10px] font-bold text-white">#{i + 1}</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center gap-1 overflow-hidden">
            <span className="truncate text-sm font-medium">{game.title}</span>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${
                    (game.minutes / (stats.topPlayed[0]?.minutes || 1)) * 100
                  }%`,
                }}
              />
            </div>
          </div>
          <div className="w-16 text-right text-xs text-muted-foreground">
            {game.hours}h
          </div>
        </div>
      ))}
      {stats.topPlayed.length === 0 && (
         <div className="flex h-[300px] items-center justify-center text-muted-foreground">
           No playtime data
         </div>
      )}
    </div>
  );
}

export function GenresBarChart({ stats }: StatsChartsProps) {
  if (stats.genreDistribution.length === 0) {
    return (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          No genre data
        </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={stats.genreDistribution}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          width={100}
          tick={{ fontSize: 12, fill: "#a1a1aa" }} // zinc-400
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", color: "#fff" }}
        />
        <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlatformsBarChart({ stats }: StatsChartsProps) {
  if (stats.platformDistribution.length === 0) {
    return (
        <div className="flex h-[300px] items-center justify-center text-muted-foreground">
          No platform data
        </div>
    );
  }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={stats.platformDistribution}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", color: "#fff" }}
          />
          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
