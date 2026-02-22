import Papa from "papaparse";
import { Post } from "./types";

const COLUMN_MAPPINGS: Record<string, string[]> = {
  date: ["date", "日付", "timestamp", "投稿日", "created_at", "posted_at"],
  accountId: ["account_id", "アカウントID", "user_id", "ユーザーID"],
  accountName: [
    "account_name",
    "アカウント名",
    "user_name",
    "ユーザー名",
    "name",
    "名前",
    "screen_name",
  ],
  topic: ["topic", "トピック", "category", "カテゴリ", "分類", "tag", "タグ"],
  content: [
    "content",
    "内容",
    "text",
    "テキスト",
    "本文",
    "body",
    "tweet",
    "post",
  ],
  likes: [
    "likes",
    "いいね",
    "like_count",
    "いいね数",
    "favorite_count",
    "favorites",
  ],
  retweets: [
    "retweets",
    "リツイート",
    "retweet_count",
    "リツイート数",
    "rt",
    "rt_count",
  ],
  replies: [
    "replies",
    "リプライ",
    "reply_count",
    "リプライ数",
    "返信",
    "返信数",
  ],
  impressions: [
    "impressions",
    "インプレッション",
    "impression_count",
    "表示回数",
    "views",
    "閲覧数",
  ],
};

function findColumnMapping(
  headers: string[]
): Record<string, string | undefined> {
  const mapping: Record<string, string | undefined> = {};
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());

  for (const [field, candidates] of Object.entries(COLUMN_MAPPINGS)) {
    const matchIndex = lowerHeaders.findIndex((h) =>
      candidates.some((c) => h === c.toLowerCase())
    );
    mapping[field] = matchIndex >= 0 ? headers[matchIndex] : undefined;
  }

  return mapping;
}

export function parseCSV(
  file: File
): Promise<{ posts: Post[]; errors: string[] }> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const errors: string[] = [];
        const headers = results.meta.fields || [];
        const mapping = findColumnMapping(headers);

        if (!mapping.date) {
          errors.push(
            "日付カラムが見つかりません (date, 日付, timestamp のいずれか)"
          );
        }
        if (!mapping.content && !mapping.topic) {
          errors.push(
            "内容またはトピックカラムが必要です (content/内容 または topic/トピック)"
          );
        }

        if (errors.length > 0) {
          resolve({ posts: [], errors });
          return;
        }

        const posts: Post[] = [];

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i] as Record<string, string>;

          const dateVal = mapping.date ? row[mapping.date] : "";
          const parsedDate = parseDate(dateVal);

          if (!parsedDate) {
            errors.push(`行 ${i + 2}: 日付の形式が不正です "${dateVal}"`);
            continue;
          }

          posts.push({
            id: `csv-${i + 1}`,
            date: parsedDate,
            accountId:
              mapping.accountId
                ? row[mapping.accountId] || `unknown-${i}`
                : `unknown-${i}`,
            accountName:
              mapping.accountName
                ? row[mapping.accountName] || "不明"
                : "不明",
            topic: mapping.topic ? row[mapping.topic] || "未分類" : "未分類",
            content: mapping.content ? row[mapping.content] || "" : "",
            likes: parseInt(mapping.likes ? row[mapping.likes] : "0") || 0,
            retweets:
              parseInt(mapping.retweets ? row[mapping.retweets] : "0") || 0,
            replies:
              parseInt(mapping.replies ? row[mapping.replies] : "0") || 0,
            impressions:
              parseInt(mapping.impressions ? row[mapping.impressions] : "0") ||
              0,
          });
        }

        resolve({ posts, errors });
      },
      error: (error) => {
        resolve({ posts: [], errors: [`CSV解析エラー: ${error.message}`] });
      },
    });
  });
}

function parseDate(value: string): string | null {
  if (!value) return null;

  const trimmed = value.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, "-");
  }

  // ISO datetime
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Try Date.parse as fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}
