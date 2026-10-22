"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MonitorHeader, RangeSelect } from "@/components/monitor/monitor-header";
import { RANGE_OPTIONS, useMonitorData } from "@/components/monitor/use-monitor-data";
import { dailyStanceCounts, formatJst, stanceTotals, topTopics } from "@/lib/monitor/analytics";
import { MonitorPostRow, STANCES, STANCE_COLORS, STANCE_LABELS, WatchTarget } from "@/lib/monitor/types";

const SERIES_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c"];

export default function ComparePage() {
  return (
    <Suspense>
      <CompareView />
    </Suspense>
  );
}

function CompareView() {
  const router = useRouter();
  const params = useSearchParams();
  const [days, setDays] = useState<number | null>(30);

  const { targets } = useMonitorData([], null);
  const candidates = useMemo(() => targets.filter((t) => t.kind === "candidate"), [targets]);
  const selected = useMemo(() => {
    const slugs = params.get("targets")?.split(",").filter(Boolean);
    const list = slugs?.length
      ? candidates.filter((t) => slugs.includes(t.slug))
      : candidates.filter((t) => t.active);
    return list;
  }, [candidates, params]);

  const { rows, store, error } = useMonitorData(selected.map((t) => t.id), days);
  const byTarget = useMemo(() => {
    const m = new Map<string, MonitorPostRow[]>();
    // 本人の投稿は分類しないので比較から外す
    for (const r of rows.filter((r) => r.post_kind !== "own")) m.set(r.target_id, [...(m.get(r.target_id) ?? []), r]);
    return m;
  }, [rows]);

  const toggle = (slug: string) => {
    const current = new Set(selected.map((t) => t.slug));
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    router.replace(`/monitor/compare?targets=${[...current].join(",")}`);
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorHeader active="compare" store={store} />

        <div className="flex flex-wrap items-center gap-3">
          {candidates.map((t) => (
            <label key={t.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={selected.some((s) => s.id === t.id)} onChange={() => toggle(t.slug)} />
              {t.name}
            </label>
          ))}
          <RangeSelect days={days} onChange={setDays} options={RANGE_OPTIONS} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {candidates.length < 2 && (
          <p className="text-muted-foreground text-sm">比較するには候補者（kind=candidate）を2人以上登録してください。</p>
        )}

        <DailyOverlay targets={selected} byTarget={byTarget} />

        <div className="overflow-x-auto pb-2">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, selected.length)}, minmax(260px, 1fr))` }}>
            {selected.map((t, i) => (
              <TargetColumn key={t.id} target={t} rows={byTarget.get(t.id) ?? []} color={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function DailyOverlay({ targets, byTarget }: { targets: WatchTarget[]; byTarget: Map<string, MonitorPostRow[]> }) {
  const { data, config } = useMemo(() => {
    const config: ChartConfig = {};
    const byDate = new Map<string, Record<string, string | number>>();
    targets.forEach((t, i) => {
      const key = `t${i}`;
      config[key] = { label: t.name, color: SERIES_COLORS[i % SERIES_COLORS.length] };
      for (const d of dailyStanceCounts(byTarget.get(t.id) ?? [])) {
        const entry = byDate.get(d.date) ?? { date: d.date, label: d.date.slice(5) };
        entry[key] = d.total;
        byDate.set(d.date, entry);
      }
    });
    const data = [...byDate.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .map((e) => {
        targets.forEach((_, i) => (e[`t${i}`] ??= 0));
        return e;
      });
    return { data, config };
  }, [targets, byTarget]);

  if (targets.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">日別投稿数の推移</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="h-[240px] w-full">
          <LineChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            {targets.map((_, i) => (
              <Line key={i} dataKey={`t${i}`} type="monotone" stroke={`var(--color-t${i})`} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ChartContainer>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {targets.map((t, i) => (
            <span key={t.id} className="text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {t.name}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TargetColumn({ target, rows, color }: { target: WatchTarget; rows: MonitorPostRow[]; color: string }) {
  const totals = stanceTotals(rows);
  const classified = rows.length - totals.unclassified;
  const high = rows.filter((r) => r.risk === "high");
  const topics = topTopics(rows, 6);

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
          {target.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-muted-foreground text-xs">投稿数</p>
            <p className="text-xl font-semibold tabular-nums">{rows.length}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">要チェック</p>
            <p className={`text-xl font-semibold tabular-nums ${high.length ? "text-red-400" : ""}`}>{high.length}</p>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1 text-xs">stance 構成（分類済み {classified}件）</p>
          <div className="flex h-3 overflow-hidden rounded bg-zinc-800">
            {classified > 0 &&
              STANCES.map((s) => (
                <div key={s} style={{ width: `${(totals[s] / classified) * 100}%`, backgroundColor: STANCE_COLORS[s] }} title={`${STANCE_LABELS[s]} ${totals[s]}`} />
              ))}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-xs">
            {STANCES.map((s) => (
              <span key={s} className="text-muted-foreground">
                <span style={{ color: STANCE_COLORS[s] }}>●</span> {STANCE_LABELS[s]} {totals[s]}
                {classified > 0 && <span className="text-zinc-500">（{Math.round((totals[s] / classified) * 100)}%）</span>}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1 text-xs">主な topic</p>
          <ul className="space-y-0.5">
            {topics.map((t) => (
              <li key={t.topic} className="flex justify-between text-xs">
                <span>{t.topic}</span>
                <span className="tabular-nums text-zinc-400">{t.count}</span>
              </li>
            ))}
            {topics.length === 0 && <li className="text-xs text-zinc-500">-</li>}
          </ul>
        </div>

        {high.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-red-300">最新の要チェック投稿</p>
            <ul className="space-y-1.5">
              {high.slice(0, 3).map((r) => (
                <li key={r.id} className="rounded border border-red-500/30 bg-red-950/30 p-2 text-xs">
                  <span className="text-red-200/70">{formatJst(r.posted_at)}</span>
                  <p className="line-clamp-3 text-zinc-200">{r.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
