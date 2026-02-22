"use client";

import Link from "next/link";

function RadarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="16" cy="16" r="14" stroke="url(#radar-grad)" strokeWidth="2" opacity="0.3" />
      <circle cx="16" cy="16" r="9" stroke="url(#radar-grad)" strokeWidth="1.5" opacity="0.5" />
      <circle cx="16" cy="16" r="4" stroke="url(#radar-grad)" strokeWidth="1.5" opacity="0.7" />
      <line x1="16" y1="16" x2="16" y2="2" stroke="url(#radar-grad)" strokeWidth="2" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="4s" repeatCount="indefinite" />
      </line>
      <path d="M16 16 L16 2 A14 14 0 0 1 28.1 9.6 Z" fill="url(#radar-grad)" opacity="0.15">
        <animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="4s" repeatCount="indefinite" />
      </path>
      <circle cx="20" cy="8" r="1.5" fill="#34d399" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="10" cy="12" r="1" fill="#60a5fa" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="22" cy="20" r="1.2" fill="#f472b6" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="3s" repeatCount="indefinite" />
      </circle>
      <defs>
        <linearGradient id="radar-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function DashboardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <RadarIcon className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
        <div className="min-w-0">
          <h1 className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-4xl whitespace-nowrap">
            Social Radar
          </h1>
          <p className="text-zinc-500 text-[11px] sm:text-xs tracking-wide">
            地域分析ダッシュボード
          </p>
        </div>
      </div>
      <Link
        href="/admin"
        className="text-muted-foreground hover:text-foreground rounded-md border border-zinc-800 px-3 py-1.5 text-xs transition-colors hover:border-zinc-600"
      >
        管理
      </Link>
    </div>
  );
}
