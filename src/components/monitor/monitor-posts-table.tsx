"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCount, formatJst } from "@/lib/monitor/analytics";
import {
  MonitorPostRow,
  RISKS,
  RISK_LABELS,
  Risk,
  STANCES,
  STANCE_COLORS,
  STANCE_LABELS,
  Stance,
} from "@/lib/monitor/types";

const PAGE_SIZE = 25;
const selectClass = "rounded-md border border-zinc-800 bg-background px-2 py-1 text-xs";

export function StanceBadge({ stance }: { stance: Stance | null }) {
  if (!stance) return <span className="text-xs text-zinc-500">未分類</span>;
  return (
    <span className="rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: `${STANCE_COLORS[stance]}26`, color: STANCE_COLORS[stance] }}>
      {STANCE_LABELS[stance]}
    </span>
  );
}

function RiskBadge({ risk }: { risk: Risk | null }) {
  if (!risk) return <span className="text-xs text-zinc-500">-</span>;
  const cls = risk === "high" ? "bg-red-500/20 text-red-300" : risk === "low" ? "bg-amber-500/15 text-amber-300" : "text-zinc-500";
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{RISK_LABELS[risk]}</span>;
}

export function MonitorPostsTable({
  rows,
  onChanged,
  readOnly = false,
}: {
  rows: MonitorPostRow[];
  onChanged: () => void;
  /** 閲覧専用（判定の修正・再分類をさせない） */
  readOnly?: boolean;
}) {
  const [stance, setStance] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [topic, setTopic] = useState<string>("");
  const [text, setText] = useState("");
  const [sort, setSort] = useState<"new" | "reach">("new");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);

  const topics = useMemo(() => [...new Set(rows.map((r) => r.topic).filter(Boolean) as string[])].sort(), [rows]);

  const filtered = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (!stance || (stance === "unclassified" ? !r.stance : r.stance === stance)) &&
        (!risk || r.risk === risk) &&
        (!topic || r.topic === topic) &&
        (!text || r.content.includes(text))
    );
    return sort === "reach" ? [...list].sort((a, b) => b.impressions - a.impressions) : list;
  }, [rows, stance, risk, topic, text, sort]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const current = Math.min(page, Math.max(0, totalPages - 1));
  const paginated = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">投稿一覧</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <select className={selectClass} value={stance} onChange={(e) => { setStance(e.target.value); setPage(0); }}>
            <option value="">stance: すべて</option>
            {STANCES.map((s) => <option key={s} value={s}>{STANCE_LABELS[s]}</option>)}
            <option value="unclassified">未分類</option>
          </select>
          <select className={selectClass} value={risk} onChange={(e) => { setRisk(e.target.value); setPage(0); }}>
            <option value="">risk: すべて</option>
            {RISKS.map((r) => <option key={r} value={r}>{RISK_LABELS[r]}</option>)}
          </select>
          <select className={selectClass} value={topic} onChange={(e) => { setTopic(e.target.value); setPage(0); }}>
            <option value="">topic: すべて</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={selectClass} value={sort} onChange={(e) => { setSort(e.target.value as "new" | "reach"); setPage(0); }}>
            <option value="new">新しい順</option>
            <option value="reach">表示回数の多い順</option>
          </select>
          <input
            className={`${selectClass} w-40`}
            placeholder="本文を検索"
            value={text}
            onChange={(e) => { setText(e.target.value); setPage(0); }}
          />
          <span className="text-muted-foreground self-center text-xs">{filtered.length}件</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-3 py-2 font-medium">日時</th>
                <th className="px-3 py-2 font-medium">stance</th>
                <th className="px-3 py-2 font-medium">risk</th>
                <th className="px-3 py-2 font-medium">topic</th>
                <th className="px-3 py-2 font-medium">内容</th>
                <th className="px-3 py-2 text-right font-medium">表示</th>
                <th className="px-3 py-2 text-right font-medium">いいね</th>
                <th className="px-3 py-2 text-right font-medium">RT</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <PostRow
                  key={`${r.target_id}:${r.id}`}
                  row={r}
                  editing={!readOnly && editing === r.id}
                  readOnly={readOnly}
                  onEdit={() => setEditing(editing === r.id ? null : r.id)}
                  onSaved={() => { setEditing(null); onChanged(); }}
                />
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {filtered.length}件中 {current * PAGE_SIZE + 1}〜{Math.min((current + 1) * PAGE_SIZE, filtered.length)}件
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="xs" onClick={() => setPage(current - 1)} disabled={current === 0}>前へ</Button>
              <Button variant="outline" size="xs" onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1}>次へ</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PostRow({
  row,
  editing,
  readOnly,
  onEdit,
  onSaved,
}: {
  row: MonitorPostRow;
  editing: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const corrected = row.assessment_source === "human";
  return (
    <>
      <tr className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 ${row.risk === "high" ? "bg-red-950/20" : ""}`}>
        <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatJst(row.posted_at)}</td>
        <td className="whitespace-nowrap px-3 py-2"><StanceBadge stance={row.stance} /></td>
        <td className="whitespace-nowrap px-3 py-2"><RiskBadge risk={row.risk} /></td>
        <td className="whitespace-nowrap px-3 py-2">
          {row.topic && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">{row.topic}</span>}
          {corrected && (
            <span
              className="ml-1 text-[10px] text-sky-400"
              title={`元の判定: ${row.original_stance ?? "-"} / ${row.original_risk ?? "-"} / ${row.original_topic ?? "-"}`}
            >
              修正済
            </span>
          )}
        </td>
        <td className="max-w-[240px] px-3 py-2 text-zinc-300 sm:max-w-lg">
          <span className="flex items-center gap-1.5">
            {row.source === "mock" && <span className="shrink-0 rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">MOCK</span>}
            {row.post_kind === "reply" && <span className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] text-sky-300">本人へのリプライ</span>}
            <span className="truncate" title={row.content}>{row.content}</span>
            {row.url && (
              <a href={row.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300">↗</a>
            )}
          </span>
          {row.classify_error && <span className="block text-[11px] text-amber-400">分類エラー: {row.classify_error}</span>}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-400 tabular-nums">{formatCount(row.impressions)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-400 tabular-nums">{formatCount(row.likes)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-400">{row.retweets}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {!readOnly && <Button variant="ghost" size="xs" onClick={onEdit}>{editing ? "閉じる" : "修正"}</Button>}
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-zinc-800/50 bg-zinc-900/60">
          <td colSpan={9} className="px-3 py-3">
            <CorrectionForm row={row} onSaved={onSaved} />
          </td>
        </tr>
      )}
    </>
  );
}

function CorrectionForm({ row, onSaved }: { row: MonitorPostRow; onSaved: () => void }) {
  const [stance, setStance] = useState<Stance>(row.stance ?? "neutral");
  const [risk, setRisk] = useState<Risk>(row.risk ?? "none");
  const [topic, setTopic] = useState(row.topic ?? "");
  const [reason, setReason] = useState(row.risk_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const post = async (url: string, body: object) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-sm text-zinc-200">{row.content}</p>
      {row.model && (
        <p className="text-xs text-zinc-500">
          現在の判定: {row.assessment_source === "human" ? "人手修正" : row.model}
          {row.original_stance && ` ／ モデル原判定: ${STANCE_LABELS[row.original_stance]}・risk ${row.original_risk}・${row.original_topic ?? "-"}`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClass} value={stance} onChange={(e) => setStance(e.target.value as Stance)}>
          {STANCES.map((s) => <option key={s} value={s}>{STANCE_LABELS[s]}</option>)}
        </select>
        <select className={selectClass} value={risk} onChange={(e) => setRisk(e.target.value as Risk)}>
          {RISKS.map((r) => <option key={r} value={r}>risk: {RISK_LABELS[r]}</option>)}
        </select>
        <input className={`${selectClass} w-36`} placeholder="topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <input className={`${selectClass} min-w-60 flex-1`} placeholder="risk_reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="xs" disabled={busy} onClick={() => post("/api/admin/monitor/assessments", { postId: row.id, stance, risk, topic, risk_reason: reason })}>
          修正を保存
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={busy}
          onClick={() => post("/api/admin/monitor/reclassify", { postId: row.id })}
          title="Claude API を1回呼び出して再分類します"
        >
          Claudeで再分類
        </Button>
        {message && <span className="text-xs text-red-400">{message}</span>}
      </div>
    </div>
  );
}
