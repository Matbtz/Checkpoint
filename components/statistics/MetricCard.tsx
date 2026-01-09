
"use client";

import { MetricStat } from "@/actions/statistics";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MetricCardProps {
  data: MetricStat[];
  title: string; // "Genres", "Platforms", "Franchises"
}

type MetricType = "owned" | "playtime" | "completed" | "abandoned";

export function MetricCard({ data, title }: MetricCardProps) {
  const [metric, setMetric] = useState<MetricType>("owned");

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-muted-foreground">
        No {title.toLowerCase()} data
      </div>
    );
  }

  // Sort data based on selected metric
  const sortedData = [...data]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, 10); // Show top 10

  const getLabel = (type: MetricType) => {
    switch (type) {
        case "owned": return "Games Owned";
        case "playtime": return "Playtime (Hours)";
        case "completed": return "Games Finished";
        case "abandoned": return "Games Abandoned";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
         {/* Desktop Tabs */}
         <div className="hidden md:block">
            <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="owned">Owned</TabsTrigger>
                    <TabsTrigger value="playtime">Time</TabsTrigger>
                    <TabsTrigger value="completed">Finished</TabsTrigger>
                    <TabsTrigger value="abandoned">Abandoned</TabsTrigger>
                </TabsList>
            </Tabs>
         </div>

         {/* Mobile Select */}
         <div className="block md:hidden w-full">
            <Select value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="owned">Games Owned</SelectItem>
                    <SelectItem value="playtime">Playtime</SelectItem>
                    <SelectItem value="completed">Games Finished</SelectItem>
                    <SelectItem value="abandoned">Games Abandoned</SelectItem>
                </SelectContent>
            </Select>
         </div>
      </div>

      {/* Chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={100}
              tick={{ fontSize: 11, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                color: "#fff",
              }}
              formatter={(value: number | undefined) => [
                metric === "playtime" && value ? `${value}h` : value,
                getLabel(metric)
              ]}
            />
            <Bar
              dataKey={metric}
              fill="#3b82f6"
              radius={[0, 4, 4, 0]}
              barSize={20}
              className="fill-primary"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
