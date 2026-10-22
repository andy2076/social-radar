import { chromium, type BrowserContext, type Page } from "playwright";
import path from "path";
import { OWN_WINDOW_MS, type SearchOptions, type XSearchClient, type XTweet } from "./x-api";
import { parseQueryTerms } from "./queries";

// 地域分析のスクレイパー（src/lib/x-scraper.ts）と同じプロファイル・ログインを使う
const BROWSER_PROFILE_DIR = path.join(process.cwd(), "data", "chrome-profile");
const SCROLL_LIMIT = Number(process.env.X_SCRAPE_SCROLLS || 15);
const SCROLL_DELAY_MS = 1500;
// この時間内の投稿は、取得済みでも毎回読み直していいね・表示回数を更新する
const REFRESH_WINDOW_MS = Number(process.env.X_REFRESH_HOURS || 48) * 60 * 60 * 1000;
// X は画面を出さない自動ブラウザ（headless）を 403 で拒否するため、既定はウィンドウを表示する
const HEADLESS = process.env.X_SCRAPE_HEADLESS === "1";

/** API 用の演算子を Web 検索用に置き換える */
function toWebQuery(query: string): string {
  return query.replace("-is:retweet", "-filter:retweets");
}

interface RawArticle {
  id: string;
  text: string;
  created_at: string;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
}

const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/** Web 検索は語を分割してあいまいに一致させるため、本文に検索語そのものが含まれる投稿だけ残す */
function containsAnyTerm(query: string, text: string): boolean {
  const body = normalize(text);
  return parseQueryTerms(query).some((t) => body.includes(normalize(t)));
}

/** 表示中の投稿を読み取る。投稿者の情報は読まない */
async function readArticles(page: Page): Promise<RawArticle[]> {
  return page.$$eval('article[data-testid="tweet"]', (articles) => {
    // aria-label（"1,234 件のいいね" など）を優先し、表示の "1.2万" "3.4K" 形式も読む
    const count = (el: Element | null) => {
      if (!el) return 0;
      const label = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`;
      const m = label.match(/([\d][\d,.]*)\s*(万|千|K|M)?/i);
      if (!m) return 0;
      const n = parseFloat(m[1].replace(/,/g, ""));
      const unit = (m[2] ?? "").toUpperCase();
      const mult = unit === "万" ? 1e4 : unit === "千" || unit === "K" ? 1e3 : unit === "M" ? 1e6 : 1;
      return Math.round(n * mult);
    };
    const metric = (el: Element, id: string) => count(el.querySelector(`button[data-testid="${id}"]`));
    return articles.flatMap((el) => {
      const time = el.querySelector("time");
      const link = time?.closest('a[href*="/status/"]')?.getAttribute("href") ?? "";
      const id = link.match(/\/status\/(\d+)/)?.[1];
      const text = el.querySelector('div[data-testid="tweetText"]')?.textContent ?? "";
      if (!id || !text.trim() || !time) return [];
      // リポストの表示（socialContext）は除外
      if (el.querySelector('[data-testid="socialContext"]')) return [];
      return [{
        id,
        text,
        created_at: time.getAttribute("datetime") ?? new Date().toISOString(),
        likes: metric(el, "like"),
        retweets: metric(el, "retweet"),
        replies: metric(el, "reply"),
        impressions: count(el.querySelector('a[href$="/analytics"]')),
      }];
    });
  });
}

interface ScrapeOptions {
  limit: number;
  /** この投稿まで来たら（最新順なので）それ以降は読まない */
  stopAt?: (a: RawArticle) => boolean;
}

/**
 * ログイン済みブラウザで X の「最新」検索を開き、画面から公開投稿を読む。
 * 手元のPCでのみ動く（Vercel 上では Chrome を起動できない）。
 */
async function scrapeSearch(webQuery: string, { limit, stopAt }: ScrapeOptions): Promise<RawArticle[]> {
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: "chrome",
      headless: HEADLESS,
      viewport: { width: 1280, height: 800 },
      locale: "ja-JP",
      args: ["--disable-blink-features=AutomationControlled"],
    });
    const page = context.pages()[0] || (await context.newPage());
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const url = `https://x.com/search?q=${encodeURIComponent(webQuery)}&src=typed_query&f=live`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (/\/login|\/flow|\/onboarding/.test(page.url())) {
      throw new Error("X のログインが切れています。管理画面の「Xにログイン」で再ログインしてください");
    }

    const found = await page
      .waitForSelector('article[data-testid="tweet"]', { timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!found) return [];

    // 画面は仮想スクロールなので、スクロールのたびに読み取って貯める
    const seen = new Map<string, RawArticle>();
    for (let i = 0; i < SCROLL_LIMIT && seen.size < limit; i++) {
      const batch = await readArticles(page);
      for (const a of batch) seen.set(a.id, a);
      if (stopAt && batch.some(stopAt)) break;
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(SCROLL_DELAY_MS);
    }
    return [...seen.values()].sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
  } finally {
    await context?.close().catch(() => {});
  }
}

const toTweet = (a: RawArticle): XTweet => ({
  ...a,
  author_id: null,
  url: `https://x.com/i/web/status/${a.id}`,
});

class ScrapeXClient implements XSearchClient {
  readonly mock = false;
  readonly source = "scraped" as const;

  async search(query: string, opts: SearchOptions = {}): Promise<XTweet[]> {
    const limit = opts.maxResults ?? Number(process.env.X_MAX_RESULTS_PER_RUN || 100);
    const sinceId = opts.sinceId ? BigInt(opts.sinceId) : null;
    const refreshFrom = Date.now() - REFRESH_WINDOW_MS;
    // 取得済みでも、数字を更新する期間内なら返す
    const wanted = (a: RawArticle) => sinceId === null || BigInt(a.id) > sinceId || Date.parse(a.created_at) >= refreshFrom;
    const articles = await scrapeSearch(toWebQuery(query), {
      limit,
      // 取得済みかつ更新期間より古い投稿に達したら終わり
      stopAt: sinceId === null ? undefined : (a) => !wanted(a),
    });
    return articles
      .filter(wanted)
      .filter((a) => containsAnyTerm(query, a.text))
      .slice(0, limit)
      .map(toTweet);
  }

  async ownPosts(handle: string): Promise<XTweet[]> {
    const from = Date.now() - OWN_WINDOW_MS;
    const inWindow = (a: RawArticle) => Date.parse(a.created_at) >= from;
    const articles = await scrapeSearch(`from:${handle} -filter:replies`, { limit: 50, stopAt: (a) => !inWindow(a) });
    return articles.filter(inWindow).map(toTweet);
  }

  async replies(handle: string, postId: string): Promise<XTweet[]> {
    const articles = await scrapeSearch(`conversation_id:${postId} -from:${handle}`, { limit: 100 });
    return articles.filter((a) => a.id !== postId).map(toTweet);
  }
}

export function createScrapeClient(): XSearchClient {
  return new ScrapeXClient();
}
