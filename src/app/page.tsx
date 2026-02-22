"use client";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { TimeSeriesChart } from "@/components/dashboard/time-series-chart";
import { TopicStackedChart } from "@/components/dashboard/topic-stacked-chart";
import { PostsTable } from "@/components/dashboard/posts-table";
import { KeywordBadges } from "@/components/dashboard/keyword-badges";
import { TopicFilter } from "@/components/dashboard/topic-filter";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <DashboardHeader />
        <p className="text-sm text-zinc-400 leading-relaxed">
          X（旧Twitter）上の都城市を中心とした近隣圏域に関する投稿を自動収集し、トピック別に分類・可視化しています。
          地域の話題やトレンドをリアルタイムに把握するための分析ダッシュボードです。
        </p>
        <div className="space-y-4">
          <KeywordBadges />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <TopicFilter />
            <DateRangeFilter />
          </div>
        </div>
        <StatsCards />
        <div className="grid gap-6 lg:grid-cols-2">
          <TimeSeriesChart />
          <TopicStackedChart />
        </div>
        <PostsTable />
      </div>
    </main>
  );
}
