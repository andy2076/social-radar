"use client";

import { useMemo } from "react";
import { formatCount, formatJst } from "@/lib/monitor/analytics";
import { MonitorPostRow } from "@/lib/monitor/types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface Group {
  topic: string;
  posts: MonitorPostRow[];
  last24h: number;
  prev24h: number;
  firstAt: string;
  latestAt: string;
  retweets: number;
  impressions: number;
  likes: number;
}

/** 要チェック投稿を話題ごとにまとめ、直近24時間に増えている話題を上にする */
function groupByTopic(rows: MonitorPostRow[]): Group[] {
  const now = Date.now();
  const map = new Map<string, MonitorPostRow[]>();
  for (const r of rows) {
    const key = r.topic || "（話題なし）";
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .map(([topic, posts]) => {
      const sorted = [...posts].sort((a, b) => b.posted_at.localeCompare(a.posted_at));
      const byReach = [...posts].sort((a, b) => b.impressions - a.impressions);
      const age = (r: MonitorPostRow) => now - Date.parse(r.posted_at);
      return {
        topic,
        posts: byReach,
        last24h: posts.filter((r) => age(r) < DAY_MS).length,
        prev24h: posts.filter((r) => age(r) >= DAY_MS && age(r) < 2 * DAY_MS).length,
        firstAt: sorted[sorted.length - 1].posted_at,
        latestAt: sorted[0].posted_at,
        retweets: posts.reduce((n, r) => n + r.retweets, 0),
        impressions: posts.reduce((n, r) => n + r.impressions, 0),
        likes: posts.reduce((n, r) => n + r.likes, 0),
      };
    })
    // どれだけ見られたか（表示回数）を優先し、同じなら直近の件数
    .sort((a, b) => b.impressions - a.impressions || b.last24h - a.last24h || b.posts.length - a.posts.length);
}

export function HighRiskList({ rows }: { rows: MonitorPostRow[] }) {
  const groups = useMemo(() => groupByTopic(rows.filter((r) => r.risk === "high")), [rows]);
  const total = groups.reduce((n, g) => n + g.posts.length, 0);

  if (total === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 px-5 py-3 text-sm text-zinc-400">
        要チェックの投稿はありません
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/50 bg-red-950/30">
      <div className="border-b border-red-500/30 px-5 py-3">
        <h2 className="text-sm font-semibold text-red-300">
          要チェック {total}件（{groups.length}つの話題）
        </h2>
        <p className="mt-0.5 text-xs text-red-200/60">事実と違う可能性がある投稿を話題ごとにまとめ、よく見られている（表示回数が多い）話題を上にしています。</p>
      </div>
      <ul className="divide-y divide-red-500/20">
        {groups.map((g) => (
          <li key={g.topic}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm hover:bg-red-500/5">
                <span className="font-medium text-zinc-100">{g.topic}</span>
                <span className="text-red-200">{g.posts.length}件</span>
                <span className="text-red-200">表示 {formatCount(g.impressions)}</span>
                {g.last24h > 0 && (
                  <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-xs text-red-200">
                    直近24時間 +{g.last24h}
                    {g.last24h > g.prev24h && " ↑増加中"}
                  </span>
                )}
                <span className="text-xs text-red-200/60">
                  初出 {formatJst(g.firstAt)} ／ 最新 {formatJst(g.latestAt)} ／ いいね計 {formatCount(g.likes)} ／ RT計 {g.retweets}
                </span>
              </summary>
              <ul className="space-y-3 px-5 pb-4">
                {g.posts.map((r) => (
                  <li key={r.id} className="border-l-2 border-red-500/40 pl-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-red-200/70">
                      <span>{formatJst(r.posted_at)}</span>
                      {r.assessment_source === "human" && (
                        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-zinc-200">人手修正</span>
                      )}
                      {r.source === "mock" && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">MOCK</span>}
                      <span>表示 {formatCount(r.impressions)} / RT {r.retweets} / いいね {r.likes}</span>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-red-100">
                          元投稿
                        </a>
                      )}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-100">{r.content}</p>
                    {r.risk_reason && <p className="mt-1 text-xs text-red-300">理由: {r.risk_reason}</p>}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
