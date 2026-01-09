"use client";

import { UserStatistics } from "@/actions/statistics";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

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
