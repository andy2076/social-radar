"use client";

import { useCallback, useEffect, useState } from "react";
import { MonitorPostRow, WatchTarget } from "@/lib/monitor/types";

export const RANGE_OPTIONS = [
  { label: "7日", days: 7 },
  { label: "14日", days: 14 },
  { label: "30日", days: 30 },
  { label: "全期間", days: null },
] as const;

export function useMonitorData(targetIds: string[], days: number | null) {
  const [targets, setTargets] = useState<WatchTarget[]>([]);
  const [rows, setRows] = useState<MonitorPostRow[]>([]);
  const [store, setStore] = useState<string>("");
  const [role, setRole] = useState<"admin" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = targetIds.join(",");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ targets: key });
      if (days) params.set("since", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
      const res = await fetch(`/api/admin/monitor/posts?${params}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "読み込みに失敗しました");
      setTargets(data.targets);
      setRows(data.rows);
      setStore(data.store);
      setRole(data.role);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [key, days]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { targets, rows, store, role, loading, error, reload };
}
