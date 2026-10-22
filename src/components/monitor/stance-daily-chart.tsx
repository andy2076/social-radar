"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { dailyStanceCounts } from "@/lib/monitor/analytics";
import { MonitorPostRow, STANCES, STANCE_COLORS, STANCE_LABELS } from "@/lib/monitor/types";

const chartConfig: ChartConfig = {
  ...Object.fromEntries(STANCES.map((s) => [s, { label: STANCE_LABELS[s], color: STANCE_COLORS[s] }])),
  unclassified: { label: "未分類", color: "#3f3f46" },
};

export function StanceDailyChart({ rows }: { rows: MonitorPostRow[] }) {
  const data = useMemo(() => dailyStanceCounts(rows), [rows]);
  const keys = [...STANCES, "unclassified"] as const;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">日別投稿数（stance 別）</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">データがありません</p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={data} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} labelFormatter={(v) => `日付: ${v}`} />
              {keys.map((k) => (
                <Bar key={k} dataKey={k} stackId="stance" fill={`var(--color-${k})`} />
              ))}
            </BarChart>
          </ChartContainer>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {keys.map((k) => (
            <span key={k} className="text-muted-foreground flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: chartConfig[k].color }}
              />
              {chartConfig[k].label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
