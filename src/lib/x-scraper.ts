import { chromium, type Page } from "playwright";
import { promises as fs } from "fs";
import path from "path";
import { Post } from "./types";
import { classifyTopic } from "./topic-classifier";
import { SCRAPER_CONFIG } from "./scraper-config";

interface RawTweet {
  text: string;
  accountName: string;
  accountId: string;
  date: string;
  likes: number;
  retweets: number;
  replies: number;
  url: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const BROWSER_PROFILE_DIR = path.join(DATA_DIR, "chrome-profile");
const SESSION_MARKER = path.join(DATA_DIR, "x-logged-in");

export async function hasSession(): Promise<boolean> {
  try {
    await fs.access(SESSION_MARKER);
    return true;
  } catch {
    return false;
  }
}

/**
 * 実際のChromeをpersistent contextで開いてログインしてもらう
 */
export async function openLoginBrowser(): Promise<{
  success: boolean;
  message: string;
}> {
  let context = null;
  try {
    await fs.mkdir(BROWSER_PROFILE_DIR, { recursive: true });

    // 実際のChromeを使い、プロファイルを保持
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1280, height: 800 },
      locale: "ja-JP",
      args: [
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = context.pages()[0] || (await context.newPage());

    // navigator.webdriverを隠す
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    await page.goto("https://x.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // ユーザーがログイン完了するのを待つ（最大5分）
    try {
      await page.waitForURL(
        (url) =>
          url.pathname === "/home" ||
          (!url.pathname.includes("/login") &&
            !url.pathname.includes("/flow")),
        { timeout: 300000 }
      );
    } catch {
      // タイムアウト
    }

    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const loggedIn =
      !currentUrl.includes("/login") && !currentUrl.includes("/flow");

    if (loggedIn) {
      await fs.writeFile(SESSION_MARKER, new Date().toISOString(), "utf-8");
      await context.close();
      return {
        success: true,
        message: "ログイン成功！セッションを保存しました。",
      };
    }

    await context.close();
    return { success: false, message: "ログインが完了しませんでした" };
  } catch (error) {
    if (context) await context.close().catch(() => {});
    return { success: false, message: String(error) };
  }
}

async function extractTweets(page: Page): Promise<RawTweet[]> {
  const tweets: RawTweet[] = [];

  for (let i = 0; i < SCRAPER_CONFIG.scrollAttempts; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(SCRAPER_CONFIG.scrollDelayMs);
  }

  const tweetElements = await page.$$('article[data-testid="tweet"]');

  for (const el of tweetElements) {
    try {
      const textEl = await el.$('div[data-testid="tweetText"]');
      const text = textEl ? ((await textEl.textContent()) ?? "") : "";
      if (!text.trim()) continue;

      let accountName = "";
      let accountId = "";

      // User-Name div にはアカウント表示名と @handle が含まれる
      const userNameDiv = await el.$('div[data-testid="User-Name"]');
      if (userNameDiv) {
        // リンクからプロフィールURLを取得 → accountId
        const links = await userNameDiv.$$("a");
        for (const link of links) {
          const href = await link.getAttribute("href");
          if (href && href.startsWith("/") && !href.includes("/status/") && !href.includes("/hashtag/")) {
            accountId = href.slice(1);
            break;
          }
        }
        // テキスト全体から表示名と@handleを取得
        const fullText = (await userNameDiv.textContent()) ?? "";
        // "@handle" の前の部分が表示名
        const atMatch = fullText.match(/@([\w]+)/);
        if (atMatch) {
          if (!accountId) accountId = atMatch[1];
          // 表示名は全テキストから @handle以降 と · 以降を除いた最初の部分
          const nameIdx = fullText.indexOf("@");
          if (nameIdx > 0) {
            accountName = fullText.slice(0, nameIdx).trim();
          }
        }
        // それでも取れなければ最初のリンクのテキストを使う
        if (!accountName && links.length > 0) {
          accountName = ((await links[0].textContent()) ?? "").trim();
        }
      }

      // フォールバック: 古い方法
      if (!accountId) {
        const userLinks = await el.$$('a[role="link"]');
        for (const link of userLinks) {
          const href = await link.getAttribute("href");
          if (href && href.startsWith("/") && !href.includes("/status/")) {
            accountId = href.slice(1);
            const nameEl = await link.$("span");
            if (nameEl) {
              accountName = (await nameEl.textContent()) ?? accountId;
            }
            break;
          }
        }
      }

      const timeEl = await el.$("time");
      const datetime = timeEl
        ? ((await timeEl.getAttribute("datetime")) ?? "")
        : "";
      const date = datetime
        ? datetime.split("T")[0]
        : new Date().toISOString().split("T")[0];

      const parseMetric = async (testId: string): Promise<number> => {
        const metricEl = await el.$(`button[data-testid="${testId}"]`);
        if (!metricEl) return 0;
        const metricText = (await metricEl.textContent()) ?? "0";
        const num = metricText.replace(/[^0-9]/g, "");
        return num ? parseInt(num, 10) : 0;
      };

      const replies = await parseMetric("reply");
      const retweets = await parseMetric("retweet");
      const likes = await parseMetric("like");

      // ツイートURLを取得
      let tweetUrl = "";
      const statusLinks = await el.$$('a[href*="/status/"]');
      for (const link of statusLinks) {
        const href = await link.getAttribute("href");
        if (href && href.includes("/status/")) {
          tweetUrl = href.startsWith("http") ? href : `https://x.com${href}`;
          break;
        }
      }

      tweets.push({
        text,
        accountName,
        accountId,
        date,
        likes,
        retweets,
        replies,
        url: tweetUrl,
      });
    } catch {
      continue;
    }
  }

  return tweets;
}

/**
 * 保存済みプロファイルを使ってスクレイピング
 */
export async function scrapeX(
  keywords?: string[],
  since?: string,
  until?: string
): Promise<Post[]> {
  const sessionExists = await hasSession();
  if (!sessionExists) {
    throw new Error(
      "セッションがありません。先に「Xにログイン」でログインしてください。"
    );
  }

  let context = null;

  try {
    // 同じプロファイルをheadlessで再利用
    context = await chromium.launchPersistentContext(BROWSER_PROFILE_DIR, {
      channel: "chrome",
      headless: true,
      viewport: { width: 1280, height: 800 },
      locale: "ja-JP",
      args: [
        "--disable-blink-features=AutomationControlled",
      ],
    });

    const page = context.pages()[0] || (await context.newPage());

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // セッション有効チェック
    await page.goto("https://x.com/home", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);

    if (
      page.url().includes("/login") ||
      page.url().includes("/flow")
    ) {
      await context.close();
      // マーカー削除
      await fs.unlink(SESSION_MARKER).catch(() => {});
      throw new Error(
        "セッションが期限切れです。「Xにログイン」で再ログインしてください。"
      );
    }

    // 検索実行
    const allTweets: RawTweet[] = [];
    const baseKeywords =
      keywords && keywords.length > 0
        ? keywords
        : SCRAPER_CONFIG.baseKeywords;

    // 検索URLを生成
    const searchUrls: string[] = [];

    if (since && until) {
      // 1日ずつ区切って検索（過去データを確実に拾う）
      const startDate = new Date(since);
      const endDate = new Date(until);

      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().split("T")[0];
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayStr = nextDay.toISOString().split("T")[0];
        const datePart = `since:${dayStr} until:${nextDayStr}`;

        for (const kw of baseKeywords) {
          searchUrls.push(
            `https://x.com/search?q=${encodeURIComponent(`${kw} ${datePart}`)}&src=typed_query&f=live`
          );
        }
      }
    } else {
      // 期間指定なし：最新を取得
      for (const kw of baseKeywords) {
        searchUrls.push(
          `https://x.com/search?q=${encodeURIComponent(kw)}&src=typed_query&f=live`
        );
      }
    }

    console.log(`[scraper] ${searchUrls.length}件の検索を実行します`);

    for (let i = 0; i < searchUrls.length; i++) {
      const url = searchUrls[i];
      try {
        console.log(`[scraper] (${i + 1}/${searchUrls.length}) ${decodeURIComponent(url.split("q=")[1]?.split("&")[0] ?? "")}`);

        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: SCRAPER_CONFIG.requestTimeoutMs,
        });

        const found = await page
          .waitForSelector('article[data-testid="tweet"]', { timeout: 10000 })
          .then(() => true)
          .catch(() => false);

        if (found) {
          const tweets = await extractTweets(page);
          allTweets.push(...tweets);
          console.log(`[scraper]   → ${tweets.length}件取得`);
        } else {
          console.log(`[scraper]   → 0件`);
        }

        await page.waitForTimeout(800);
      } catch {
        continue;
      }
    }

    await context.close();
    context = null;

    // Deduplicate
    const seen = new Set<string>();
    const uniqueTweets = allTweets.filter((t) => {
      const key = `${t.accountId}:${t.text.slice(0, 100)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[scraper] 重複除去後: ${uniqueTweets.length}件`);

    return uniqueTweets.map((tweet, i) => ({
        id: `scraped-${Date.now()}-${i}`,
        date: tweet.date,
        accountId: tweet.accountId || `unknown-${i}`,
        accountName: tweet.accountName || "不明",
        topic: classifyTopic(tweet.text),
        content: tweet.text,
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: tweet.replies,
        impressions: 0,
        source: "scraped" as const,
        url: tweet.url || undefined,
      }));
  } catch (error) {
    if (context) await context.close().catch(() => {});
    throw error;
  }
}
