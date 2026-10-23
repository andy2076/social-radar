"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonitorHeader, RangeSelect } from "@/components/monitor/monitor-header";
import { RANGE_OPTIONS, useMonitorData } from "@/components/monitor/use-monitor-data";
import { StanceDailyChart } from "@/components/monitor/stance-daily-chart";
import { HighRiskList } from "@/components/monitor/high-risk-list";
import { SpreadTable } from "@/components/monitor/spread-table";
import { MonitorPostsTable } from "@/components/monitor/monitor-posts-table";
import { OwnPostsCard } from "@/components/monitor/own-posts-card";
import { stanceTotals } from "@/lib/monitor/analytics";
import { WatchTarget } from "@/lib/monitor/types";

export default function MonitorPage() {
  return (
    <Suspense>
      <MonitorDashboard />
    </Suspense>
  );
}

function TargetSelect({
  targets,
  value,
  onChange,
}: {
  targets: WatchTarget[];
  value: WatchTarget | undefined;
  onChange: (slug: string) => void;
}) {
  return (
    <select
      className="rounded-md border border-zinc-800 bg-background px-3 py-1.5 text-sm"
      value={value?.slug ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      {targets.length === 0 && <option value="">監視対象が未登録です</option>}
      {targets.map((t) => (
        <option key={t.id} value={t.slug}>
          {t.kind === "election" ? "🗳 " : ""}
          {t.name}
          {t.active ? "" : "（停止中）"}
        </option>
      ))}
    </select>
  );
}

function MonitorDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const [days, setDays] = useState<number | null>(30);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  // まず監視対象一覧だけ取得し、選択中の対象で投稿を取り直す
  const { targets } = useMonitorData([], null);
  const selected = useMemo(() => {
    const slug = params.get("target");
    return targets.find((t) => t.slug === slug) ?? targets.find((t) => t.kind === "candidate") ?? targets[0];
  }, [targets, params]);
  const { rows: allRows, store, role, loading, error, reload } = useMonitorData(selected ? [selected.id] : [], days);
  // 本人の投稿は分類しないので、言及・リプライの集計からは外す
  const rows = useMemo(() => allRows.filter((r) => r.post_kind !== "own"), [allRows]);

  const totals = useMemo(() => stanceTotals(rows), [rows]);
  const highCount = rows.filter((r) => r.risk === "high").length;
  const negative = totals.critical + totals.hostile;
  const classified = rows.length - totals.unclassified;

  const runNow = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch("/api/admin/monitor/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      const inserted = r.collected.reduce((n: number, c: { inserted?: number }) => n + (c.inserted || 0), 0);
      const errors = r.collected.filter((c: { error?: string }) => c.error).map((c: { target: string; error: string }) => `${c.target}: ${c.error}`);
      setRunMessage(
        [
          `新規 ${inserted}件${r.xMock ? "（ダミー投稿）" : ""}`,
          r.classifier === "unavailable" ? "分類: ANTHROPIC_API_KEY 未設定のためスキップ" : `分類 ${r.classified}件（${r.classifier}）`,
          r.alerts.length ? `通知 ${r.alerts.filter((a: { ok: boolean }) => a.ok).length}/${r.alerts.length}件` : null,
          r.classifyErrors.length ? `分類エラー ${r.classifyErrors.length}件` : null,
          ...errors,
        ]
          .filter(Boolean)
          .join(" ／ ")
      );
      reload();
    } catch (e) {
      setRunMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <MonitorHeader active="dashboard" store={store} canManage={role === "admin"} />

        <div className="flex flex-wrap items-center gap-3">
          <TargetSelect targets={targets} value={selected} onChange={(slug) => router.replace(`/?target=${slug}`)} />
          <RangeSelect days={days} onChange={setDays} options={RANGE_OPTIONS} />
          {role === "admin" && (
            <Button size="sm" variant="outline" onClick={runNow} disabled={running}>
              {running ? "実行中..." : "今すぐ収集・分類"}
            </Button>
          )}
          {runMessage && <span className="text-muted-foreground text-xs">{runMessage}</span>}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <HighRiskList rows={rows} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="投稿数" value={rows.length} />
          <Stat label="要チェック" value={highCount} accent={highCount > 0 ? "text-red-400" : undefined} />
          <Stat label="批判・敵対の割合" value={classified ? `${Math.round((negative / classified) * 100)}%` : "-"} />
          <Stat label="未分類" value={totals.unclassified} />
        </div>

        <OwnPostsCard rows={allRows} handle={selected?.x_handle ?? null} />

        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <StanceDailyChart rows={rows} />
          <SpreadTable rows={rows} />
        </div>

        {loading && rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">読み込み中...</p>
        ) : (
          <MonitorPostsTable rows={rows} onChanged={reload} readOnly={role !== "admin"} />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-muted-foreground text-xs font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className={`px-4 text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</CardContent>
    </Card>
  );
}
