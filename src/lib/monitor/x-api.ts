import { createHash } from "crypto";
import { parseQueryTerms } from "./queries";

export interface XTweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  url: string;
  mock?: boolean;
}

/** 候補者本人の投稿・リプライの取得範囲（この時間内の投稿を毎回取り直す） */
export const OWN_WINDOW_MS = Number(process.env.X_REFRESH_HOURS || 48) * 60 * 60 * 1000;

export interface SearchOptions {
  sinceId?: string | null;
  maxResults?: number; // 合計の上限
}

export interface XSearchClient {
  readonly mock: boolean;
  readonly source: "x_api" | "mock" | "scraped";
  search(query: string, opts?: SearchOptions): Promise<XTweet[]>;
  /** 本人の投稿（リプライ・リポストを除く）。直近 OWN_WINDOW_MS 分 */
  ownPosts(handle: string): Promise<XTweet[]>;
  /** 本人の投稿へのリプライ（本人自身の返信は除く） */
  replies(handle: string, postId: string): Promise<XTweet[]>;
}

interface RecentSearchResponse {
  data?: {
    id: string;
    text: string;
    created_at: string;
    author_id?: string;
    public_metrics?: {
      like_count: number;
      retweet_count: number;
      reply_count: number;
      impression_count?: number;
    };
  }[];
  meta?: { next_token?: string; result_count: number };
  errors?: { message: string }[];
}

/**
 * X API v2 recent search（直近7日）。公開投稿のみが対象。
 * プロフィール情報は取得しない（expansions / user.fields を要求しない）。
 */
class XApiClient implements XSearchClient {
  readonly mock = false;
  readonly source = "x_api" as const;
  constructor(private bearer: string) {}

  async search(query: string, opts: SearchOptions = {}): Promise<XTweet[]> {
    const limit = opts.maxResults ?? Number(process.env.X_MAX_RESULTS_PER_RUN || 100);
    const tweets: XTweet[] = [];
    let nextToken: string | undefined;

    while (tweets.length < limit) {
      const params = new URLSearchParams({
        query,
        max_results: String(Math.min(100, Math.max(10, limit - tweets.length))),
        "tweet.fields": "created_at,author_id,public_metrics",
      });
      if (opts.sinceId) params.set("since_id", opts.sinceId);
      if (nextToken) params.set("next_token", nextToken);

      const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
        headers: { Authorization: `Bearer ${this.bearer}` },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const body = (await res.json()) as RecentSearchResponse;
      for (const t of body.data ?? []) {
        tweets.push({
          id: t.id,
          text: t.text,
          created_at: t.created_at,
          author_id: t.author_id ?? null,
          likes: t.public_metrics?.like_count ?? 0,
          retweets: t.public_metrics?.retweet_count ?? 0,
          replies: t.public_metrics?.reply_count ?? 0,
          impressions: t.public_metrics?.impression_count ?? 0,
          url: `https://x.com/i/web/status/${t.id}`,
        });
      }
      nextToken = body.meta?.next_token;
      if (!nextToken) break;
    }
    return tweets.slice(0, limit);
  }

  async ownPosts(handle: string): Promise<XTweet[]> {
    const tweets = await this.search(`from:${handle} -is:reply -is:retweet`, { maxResults: 50 });
    const from = Date.now() - OWN_WINDOW_MS;
    return tweets.filter((t) => Date.parse(t.created_at) >= from);
  }

  replies(handle: string, postId: string): Promise<XTweet[]> {
    return this.search(`conversation_id:${postId} is:reply -from:${handle}`, { maxResults: 100 });
  }
}

// ---------------------------------------------------------------------------
// モック: X_BEARER_TOKEN 未設定時に使う。クエリ内の語から擬似投稿を決定的に生成する。
// 時刻は3時間刻みで直近24時間ぶん。ID は時刻ベースなので since_id が実APIと同様に効く。
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES: string[] = [
  "{N}の街頭演説を聞いてきた。中山間地の農業の話が具体的で良かった",
  "{N}が知事選への出馬を表明したらしい。告示は11月下旬",
  "{N}の公約、財源の説明がなくて正直よくわからない",
  "{N}さん、選挙が近づくとテレビでよく見かけるようになりますね",
  "{N}だけは勘弁してほしい。県政をもう振り回さないで",
  "{N}の子育て支援策、他県の事例と比べると物足りない印象",
  "{N}陣営の事務所開きに行ってきた。思ったより若い人が多かった",
  "宮崎の知事選、{N}の政策討論会は来週の土曜日だそう",
];
// risk=high 判定の検証用（事実と異なる断定＋捏造引用）。各語につき1日1件だけ出す
const MOCK_HIGH_RISK = "{N}は知事時代、口蹄疫の対応を放り出して県外に逃げていたと本人がラジオで認めていた";

const MOCK_OWN = [
  "本日は都城で街頭演説。たくさんの方に足を止めていただきました。ありがとうございました",
  "中山間地の農業を守るための具体策を、近く発表します",
  "子育て世代の皆さんとの意見交換会。現場の声を政策に生かします",
];
const MOCK_REPLIES = [
  "応援しています！がんばってください",
  "具体策、楽しみにしています",
  "前の任期で途中で辞めたことの説明がまだですよね",
  "また宮崎を踏み台にするつもりですか",
  "知事時代に口蹄疫の補償金を着服していたのに、よく出られますね",
];

const SLOT_MS = 3 * 60 * 60 * 1000;
const SLOTS = 8;

function hashInt(s: string): number {
  return parseInt(createHash("sha1").update(s).digest("hex").slice(0, 8), 16);
}

class MockXClient implements XSearchClient {
  readonly mock = true;
  readonly source = "mock" as const;

  async search(query: string, opts: SearchOptions = {}): Promise<XTweet[]> {
    const terms = parseQueryTerms(query);
    const latestSlot = Math.floor(Date.now() / SLOT_MS);
    const tweets: XTweet[] = [];

    terms.forEach((term, termIdx) => {
      for (let slot = latestSlot - SLOTS + 1; slot <= latestSlot; slot++) {
        const h = hashInt(`${term}:${slot}`);
        const isHigh = slot % SLOTS === termIdx % SLOTS && !/選/.test(term);
        const template = isHigh ? MOCK_HIGH_RISK : MOCK_TEMPLATES[h % MOCK_TEMPLATES.length];
        const postedMs = slot * SLOT_MS + (h % 60) * 60 * 1000;
        if (postedMs > Date.now()) continue;
        // 時刻(ms) + 語の連番 → 単調増加する数値ID
        const id = `${postedMs}${String(termIdx).padStart(3, "0")}`;
        tweets.push({
          id,
          text: template.replaceAll("{N}", term),
          created_at: new Date(postedMs).toISOString(),
          author_id: `mock_${h % 50}`,
          likes: h % 40,
          retweets: h % 12,
          replies: h % 7,
          impressions: (h % 40) * 30,
          url: "",
          mock: true,
        });
      }
    });

    const sinceId = opts.sinceId ? BigInt(opts.sinceId) : null;
    return tweets
      .filter((t) => sinceId === null || BigInt(t.id) > sinceId)
      .sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
      .slice(0, opts.maxResults ?? 100);
  }

  // 本人の投稿: 6時間ごとに1件
  async ownPosts(handle: string): Promise<XTweet[]> {
    const step = 6 * 60 * 60 * 1000;
    const latest = Math.floor(Date.now() / step);
    const posts: XTweet[] = [];
    for (let slot = latest; slot > latest - OWN_WINDOW_MS / step; slot--) {
      const h = hashInt(`${handle}:own:${slot}`);
      const postedMs = slot * step + (h % 120) * 60 * 1000;
      if (postedMs > Date.now()) continue;
      posts.push({
        id: `${postedMs}900`,
        text: MOCK_OWN[h % MOCK_OWN.length],
        created_at: new Date(postedMs).toISOString(),
        author_id: null,
        likes: 50 + (h % 300),
        retweets: h % 60,
        replies: 5,
        impressions: 3000 + (h % 20000),
        url: "",
        mock: true,
      });
    }
    return posts;
  }

  async replies(_handle: string, postId: string): Promise<XTweet[]> {
    const base = Number(postId.slice(0, -3));
    return MOCK_REPLIES.map((text, i) => {
      const h = hashInt(`${postId}:reply:${i}`);
      const postedMs = base + (i + 1) * 7 * 60 * 1000;
      return {
        id: `${postedMs}${String(910 + i)}`,
        text,
        created_at: new Date(postedMs).toISOString(),
        author_id: null,
        likes: h % 20,
        retweets: h % 3,
        replies: 0,
        impressions: 100 + (h % 900),
        url: "",
        mock: true,
      };
    }).filter((t) => Date.parse(t.created_at) <= Date.now());
  }
}

/**
 * 収集方法の選択:
 * - X_BEARER_TOKEN があれば X API
 * - X_SOURCE=mock ならモック
 * - それ以外は、ログイン済みブラウザで画面から読む（手元のPCのみ）
 */
export async function getXClient(): Promise<XSearchClient> {
  const token = process.env.X_BEARER_TOKEN;
  if (token) return new XApiClient(token);
  if (process.env.X_SOURCE === "mock") return new MockXClient();
  if (process.env.VERCEL) {
    throw new Error("収集は手元のPCで実行してください（Vercel 上ではブラウザ収集が動きません）");
  }
  const { hasSession } = await import("../x-scraper");
  if (!(await hasSession())) {
    throw new Error("X にログインしていません。管理画面の「Xにログイン」でログインしてください");
  }
  const { createScrapeClient } = await import("./x-scrape");
  return createScrapeClient();
}
