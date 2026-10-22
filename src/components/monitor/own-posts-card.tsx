"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCount, formatJst, stanceTotals } from "@/lib/monitor/analytics";
import { MonitorPostRow, STANCES, STANCE_COLORS, STANCE_LABELS } from "@/lib/monitor/types";
import { StanceBadge } from "./monitor-posts-table";

/** 候補者本人の投稿ごとに、反応（表示回数・いいね）とリプライの傾向を並べる */
export function OwnPostsCard({ rows, handle }: { rows: MonitorPostRow[]; handle: string | null }) {
  const items = useMemo(() => {
    const replies = new Map<string, MonitorPostRow[]>();
    for (const r of rows) {
      if (r.post_kind === "reply" && r.reply_to) replies.set(r.reply_to, [...(replies.get(r.reply_to) ?? []), r]);
    }
    return rows
      .filter((r) => r.post_kind === "own")
      .sort((a, b) => b.posted_at.localeCompare(a.posted_at))
      .map((post) => {
        const rs = replies.get(post.external_id) ?? [];
        return { post, replies: rs, totals: stanceTotals(rs), high: rs.filter((r) => r.risk === "high").length };
      });
  }, [rows]);

  if (!handle) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">本人の投稿と反応（@{handle}）</CardTitle>
        <p className="text-muted-foreground text-xs">直近48時間の投稿は収集のたびに数字を取り直します。リプライは Claude で判定しています。</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">本人の投稿はまだ集まっていません</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {items.map(({ post, replies, totals, high }) => {
              const classified = replies.length - totals.unclassified;
              return (
                <li key={post.id}>
                  <details>
                    <summary className="cursor-pointer list-none py-3 hover:bg-zinc-800/30">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                        <span>{formatJst(post.posted_at)}</span>
                        <span>表示 {formatCount(post.impressions)}</span>
                        <span>いいね {formatCount(post.likes)}</span>
                        <span>RT {formatCount(post.retweets)}</span>
                        <span>リプライ {replies.length}件</span>
                        {high > 0 && <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-300">要チェック {high}</span>}
                        {post.url && (
                          <a href={post.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-200">
                            元投稿
                          </a>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-200">{post.content}</p>
                      {classified > 0 && (
                        <div className="mt-2 flex h-2 max-w-md overflow-hidden rounded bg-zinc-800">
                          {STANCES.map((s) => (
                            <div
                              key={s}
                              style={{ width: `${(totals[s] / classified) * 100}%`, backgroundColor: STANCE_COLORS[s] }}
                              title={`${STANCE_LABELS[s]} ${totals[s]}件`}
                            />
                          ))}
                        </div>
                      )}
                    </summary>
                    <ul className="space-y-2 pb-3 pl-3">
                      {replies.length === 0 && <li className="text-xs text-zinc-500">リプライはありません</li>}
                      {[...replies]
                        .sort((a, b) => b.likes - a.likes)
                        .map((r) => (
                          <li key={r.id} className={`border-l-2 pl-3 ${r.risk === "high" ? "border-red-500/60" : "border-zinc-700"}`}>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                              <StanceBadge stance={r.stance} />
                              {r.risk === "high" && <span className="text-red-300">要チェック</span>}
                              <span>いいね {formatCount(r.likes)}</span>
                            </div>
                            <p className="text-sm text-zinc-300">{r.content}</p>
                            {r.risk === "high" && r.risk_reason && <p className="text-xs text-red-300">理由: {r.risk_reason}</p>}
                          </li>
                        ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
