export type DataSource = "mock" | "csv" | "scraped";

export interface Post {
  id: string;
  date: string; // YYYY-MM-DD
  accountId: string;
  accountName: string;
  topic: string;
  content: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  source?: DataSource;
  url?: string;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface TopicDailyCount {
  date: string;
  [topic: string]: string | number; // topic名がキーになる
}

export interface TopicInfo {
  name: string;
  color: string;
  count: number;
}

export interface DashboardStats {
  totalPosts: number;
  uniqueAccounts: number;
  dateRange: { start: string; end: string };
}

export interface ScrapeResult {
  posts: Post[];
  scrapedAt: string;
  keyword: string;
  error?: string;
}
