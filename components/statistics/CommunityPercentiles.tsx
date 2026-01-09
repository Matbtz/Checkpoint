"use client";

import { UserStatistics } from "@/actions/statistics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from "recharts";

interface CommunityPercentilesProps {
    stats: UserStatistics;
}

export function CommunityPercentiles({ stats }: CommunityPercentilesProps) {
    const [metric, setMetric] = useState<"gamesOwned" | "gamesFinished" | "hoursPlayed">("gamesOwned");

    const data = stats.marketGap[metric];
    const metricLabel = {
        gamesOwned: "Games Owned",
        gamesFinished: "Games Finished",
        hoursPlayed: "Hours Played"
    }[metric];

    const description = `You are in the top ${100 - data.userPercentile}% of users (${data.userPercentile}th percentile).`;

    return (
        <Card className="col-span-4 lg:col-span-4">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Community Benchmark</CardTitle>
                        <CardDescription>See how you compare to the community.</CardDescription>
                    </div>
                    <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
                        <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Metric" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="gamesOwned">Games Owned</SelectItem>
                            <SelectItem value="gamesFinished">Games Finished</SelectItem>
                            <SelectItem value="hoursPlayed">Hours Played</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data.percentiles}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="percentile"
                                label={{ value: 'Percentile', position: 'insideBottomRight', offset: -10 }}
                                tickFormatter={(v) => `${v}%`}
                            />
                            <YAxis />
                            <Tooltip
                                formatter={(value: any) => [value, metricLabel] as [number, string]}
                                labelFormatter={(label) => `${label}th Percentile`}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#8884d8"
                                fillOpacity={1}
                                fill="url(#colorValue)"
                            />
                            <ReferenceLine x={data.userPercentile} stroke="red" label={{ position: 'top', value: 'You', fill: 'red' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 text-center text-sm font-medium text-muted-foreground">
                    {description}
                </div>
            </CardContent>
        </Card>
    );
}
