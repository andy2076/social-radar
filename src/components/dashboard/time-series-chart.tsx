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

const chartConfig = {
  count: {
    label: "投稿数",
    color: "oklch(0.488 0.243 264.376)",
  },
} satisfies ChartConfig;

export function TimeSeriesChart() {
  const { dailyCounts } = useDashboardData();

  const formattedData = dailyCounts.map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">日別投稿数</CardTitle>
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
            <Bar
              dataKey="count"
              fill="var(--color-count)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
