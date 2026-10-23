"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function MonitorHeader({
  active,
  store,
  canManage = false,
}: {
  active: "dashboard" | "compare";
  store?: string;
  /** 管理者のみ「監視対象の管理」を出す */
  canManage?: boolean;
}) {
  const tab = (key: typeof active, href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-xs transition-colors",
        active === key ? "bg-zinc-800 text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
          Social Radar
        </h1>
        <p className="text-zinc-500 text-[11px] sm:text-xs tracking-wide">
          候補者SNS監視
          {store === "file" && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-400">
              ローカルモックDB
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {tab("dashboard", "/", "ダッシュボード")}
        {tab("compare", "/compare", "候補者比較")}
        {canManage && (
          <Link
            href="/admin/targets"
            className="text-muted-foreground hover:text-foreground ml-2 rounded-md border border-zinc-800 px-3 py-1.5 text-xs transition-colors hover:border-zinc-600"
          >
            監視対象の管理
          </Link>
        )}
      </div>
    </div>
  );
}

export function RangeSelect({
  days,
  onChange,
  options,
}: {
  days: number | null;
  onChange: (days: number | null) => void;
  options: readonly { label: string; days: number | null }[];
}) {
  return (
    <div className="flex rounded-md border border-zinc-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.days)}
          className={cn(
            "rounded px-2.5 py-1 text-xs",
            days === o.days ? "bg-zinc-800 text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
