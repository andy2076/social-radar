"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJst, topicSpread } from "@/lib/monitor/analytics";
import { MonitorPostRow } from "@/lib/monitor/types";

export function SpreadTable({ rows }: { rows: MonitorPostRow[] }) {
  const spread = useMemo(() => topicSpread(rows).slice(0, 15), [rows]);
  const max = Math.max(1, ...spread.map((s) => s.within24h));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">拡散推移（topic 初出からの累計件数）</CardTitle>
      </CardHeader>
      <CardContent>
        {spread.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">分類済みの投稿がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-3 py-2 font-medium">topic</th>
                  <th className="px-3 py-2 font-medium">初出</th>
                  <th className="px-3 py-2 text-right font-medium">1h</th>
                  <th className="px-3 py-2 text-right font-medium">6h</th>
                  <th className="px-3 py-2 text-right font-medium">24h</th>
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 text-right font-medium">全期間</th>
                </tr>
              </thead>
              <tbody>
                {spread.map((s) => (
                  <tr key={s.topic} className="border-b border-zinc-800/50">
                    <td className="whitespace-nowrap px-3 py-2">
                      {s.topic}
                      {s.highRisk > 0 && (
                        <span className="ml-1.5 rounded bg-red-500/20 px-1 py-0.5 text-[10px] text-red-300">
                          要チェック {s.highRisk}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-400">{formatJst(s.firstAt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.within1h}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.within6h}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.within24h}
                      {s.ongoing && <span className="ml-1 text-[10px] text-emerald-400" title="初出から24時間未満">↗</span>}
                    </td>
                    <td className="w-32 px-3 py-2">
                      <div className="relative h-2 rounded bg-zinc-800">
                        <div className="absolute inset-y-0 left-0 rounded bg-blue-400/30" style={{ width: `${(s.within24h / max) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded bg-blue-400/60" style={{ width: `${(s.within6h / max) * 100}%` }} />
                        <div className="absolute inset-y-0 left-0 rounded bg-blue-400" style={{ width: `${(s.within1h / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
