"use client";

import { useDashboardData } from "@/contexts/data-context";

export function KeywordBadges() {
  const { keywords } = useDashboardData();

  if (keywords.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">収集キーワード</span>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/50 px-2.5 py-1 text-xs text-zinc-300"
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}
