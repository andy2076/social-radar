"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useDashboardData } from "@/contexts/data-context";
import { useMemo } from "react";

export function TopicStackedChart() {
  const { topicDailyCounts, topicInfos } = useDashboardData();

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    for (const topic of topicInfos) {
      const key = sanitizeKey(topic.name);
      config[key] = {
        label: topic.name,
        color: topic.color,
      };
    }
    return config;
  }, [topicInfos]);

  const formattedData = useMemo(() => {
    return topicDailyCounts.map((entry) => {
      const mapped: Record<string, string | number> = {
        date: entry.date,
        label: (entry.date as string).slice(5),
      };
      for (const topic of topicInfos) {
        const key = sanitizeKey(topic.name);
        mapped[key] = entry[topic.name] || 0;
      }
      return mapped;
    });
  }, [topicDailyCounts, topicInfos]);

  const topicKeys = topicInfos.map((t) => sanitizeKey(t.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">トピック別投稿数</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart data={formattedData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={<ChartTooltipContent />}
              labelFormatter={(value) => `日付: ${value}`}
            />
            {topicKeys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="topics"
                fill={`var(--color-${key})`}
              />
            ))}
          </BarChart>
        </ChartContainer>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
          {topicInfos.map((topic) => (
            <div key={topic.name} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: topic.color }}
              />
              <span className="text-muted-foreground truncate">
                {topic.name}
                <span className="ml-1 text-foreground font-medium">
                  {topic.count}
                </span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function sanitizeKey(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `topic_${Math.abs(hash) % 100000}`;
}
