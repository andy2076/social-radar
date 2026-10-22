import { MonitorPostRow, STANCES, Stance } from "./types";

const HOUR = 60 * 60 * 1000;

/** ISO → JST の YYYY-MM-DD */
export function jstDate(iso: string): string {
  return new Date(Date.parse(iso) + 9 * HOUR).toISOString().slice(0, 10);
}

export function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type StanceDailyRow = { date: string; label: string; total: number; unclassified: number } & Record<
  Stance,
  number
>;

/** 日別投稿数 + stance 別の内訳（欠けた日は0で埋める） */
export function dailyStanceCounts(rows: MonitorPostRow[]): StanceDailyRow[] {
  const map = new Map<string, StanceDailyRow>();
  const empty = (date: string): StanceDailyRow => ({
    date,
    label: date.slice(5),
    total: 0,
    unclassified: 0,
    supportive: 0,
    neutral: 0,
    critical: 0,
    hostile: 0,
  });
  for (const r of rows) {
    const date = jstDate(r.posted_at);
    const entry = map.get(date) ?? empty(date);
    entry.total++;
    if (r.stance) entry[r.stance]++;
    else entry.unclassified++;
    map.set(date, entry);
  }
  const dates = [...map.keys()].sort();
  if (dates.length === 0) return [];
  const out: StanceDailyRow[] = [];
  for (let d = new Date(`${dates[0]}T00:00:00Z`); d <= new Date(`${dates.at(-1)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) ?? empty(key));
  }
  return out;
}

export interface SpreadRow {
  topic: string;
  firstAt: string;
  within1h: number;
  within6h: number;
  within24h: number;
  total: number;
  highRisk: number;
  /** 初出から24時間が経過していない（まだ伸びる可能性がある） */
  ongoing: boolean;
}

/** 同一 topic の投稿が初出から 1h / 6h / 24h で何件に達したか */
export function topicSpread(rows: MonitorPostRow[], now = Date.now()): SpreadRow[] {
  const byTopic = new Map<string, MonitorPostRow[]>();
  for (const r of rows) {
    if (!r.topic) continue;
    const list = byTopic.get(r.topic) ?? [];
    list.push(r);
    byTopic.set(r.topic, list);
  }
  const out: SpreadRow[] = [];
  for (const [topic, list] of byTopic) {
    const times = list.map((r) => Date.parse(r.posted_at)).sort((a, b) => a - b);
    const first = times[0];
    const within = (ms: number) => times.filter((t) => t - first <= ms).length;
    out.push({
      topic,
      firstAt: new Date(first).toISOString(),
      within1h: within(HOUR),
      within6h: within(6 * HOUR),
      within24h: within(24 * HOUR),
      total: times.length,
      highRisk: list.filter((r) => r.risk === "high").length,
      ongoing: now - first < 24 * HOUR,
    });
  }
  return out.sort((a, b) => b.within24h - a.within24h || b.total - a.total);
}

export function stanceTotals(rows: MonitorPostRow[]): Record<Stance | "unclassified", number> {
  const totals = { supportive: 0, neutral: 0, critical: 0, hostile: 0, unclassified: 0 };
  for (const r of rows) totals[r.stance ?? "unclassified"]++;
  return totals;
}

export function topTopics(rows: MonitorPostRow[], n = 5): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.topic) counts.set(r.topic, (counts.get(r.topic) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([topic, count]) => ({ topic, count }));
}

export { STANCES };

/** 1.2万 のような短い表記 */
export function formatCount(n: number): string {
  if (n >= 1e4) return `${(n / 1e4).toFixed(n >= 1e5 ? 0 : 1)}万`;
  return n.toLocaleString("ja-JP");
}
