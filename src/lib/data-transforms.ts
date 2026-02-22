import { Post, DailyCount, TopicDailyCount, TopicInfo, DashboardStats } from "./types";
import { TOPIC_COLORS } from "./mock-data";

export function calculateStats(posts: Post[]): DashboardStats {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      uniqueAccounts: 0,
      dateRange: { start: "", end: "" },
    };
  }

  const uniqueAccounts = new Set(posts.map((p) => p.accountId)).size;
  const dates = posts.map((p) => p.date).sort();

  return {
    totalPosts: posts.length,
    uniqueAccounts,
    dateRange: {
      start: dates[0],
      end: dates[dates.length - 1],
    },
  };
}

export function getDailyCounts(posts: Post[]): DailyCount[] {
  const countMap = new Map<string, number>();

  for (const post of posts) {
    countMap.set(post.date, (countMap.get(post.date) || 0) + 1);
  }

  // Fill in missing dates
  const dates = Array.from(countMap.keys()).sort();
  if (dates.length === 0) return [];

  const result: DailyCount[] = [];
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: countMap.get(dateStr) || 0,
    });
  }

  return result;
}

export function getTopicDailyCounts(posts: Post[]): TopicDailyCount[] {
  const topics = getUniqueTopics(posts);
  const dateTopicMap = new Map<string, Map<string, number>>();

  for (const post of posts) {
    if (!dateTopicMap.has(post.date)) {
      dateTopicMap.set(post.date, new Map());
    }
    const topicMap = dateTopicMap.get(post.date)!;
    topicMap.set(post.topic, (topicMap.get(post.topic) || 0) + 1);
  }

  const dates = Array.from(dateTopicMap.keys()).sort();
  if (dates.length === 0) return [];

  const result: TopicDailyCount[] = [];
  const start = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const entry: TopicDailyCount = { date: dateStr };

    for (const topic of topics) {
      entry[topic] = dateTopicMap.get(dateStr)?.get(topic) || 0;
    }

    result.push(entry);
  }

  return result;
}

export function getTopicInfos(posts: Post[]): TopicInfo[] {
  const countMap = new Map<string, number>();

  for (const post of posts) {
    countMap.set(post.topic, (countMap.get(post.topic) || 0) + 1);
  }

  return Array.from(countMap.entries())
    .map(([name, count]) => ({
      name,
      color: TOPIC_COLORS[name] || getDefaultColor(name),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function getUniqueTopics(posts: Post[]): string[] {
  return Array.from(new Set(posts.map((p) => p.topic)));
}

function getDefaultColor(topic: string): string {
  // Generate a deterministic color from topic name
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = topic.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `oklch(0.65 0.20 ${hue})`;
}
