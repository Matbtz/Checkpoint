
"use client";

import { UserStatistics } from "@/actions/statistics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from "recharts";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface QualityQuantityProps {
  stats: UserStatistics;
}

export function QualityQuantity({ stats }: QualityQuantityProps) {
  const [view, setView] = useState<"scatter" | "bar">("scatter");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Tabs value={view} onValueChange={(v) => setView(v as "scatter" | "bar")}>
          <TabsList>
            <TabsTrigger value="scatter">Playtime vs Score</TabsTrigger>
            <TabsTrigger value="bar">Completed by Score</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {view === "scatter" ? (
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                type="number"
                dataKey="score"
                name="Score"
                domain={[0, 100]}
                label={{ value: "Score", position: "insideBottom", offset: -10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                dataKey="hours"
                name="Hours"
                label={{ value: "Hours Played", angle: -90, position: "insideLeft" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 shadow-lg">
                        <p className="font-semibold text-sm mb-1">{data.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Score: {data.score}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Played: {data.hours}h
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter
                name="Games"
                data={stats.scoreVsPlaytime}
                fill="#8884d8"
                fillOpacity={0.6}
                className="fill-primary"
              />
            </ScatterChart>
          ) : (
            <BarChart data={stats.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
              <XAxis
                dataKey="scoreRange"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "#a1a1aa" }}
              />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  color: "#fff",
                }}
              />
              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                className="fill-primary"
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
