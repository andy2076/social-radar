import { NextRequest, NextResponse } from "next/server";
import { loadScrapedPosts } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");

  if (action === "session-status") {
    try {
      const { hasSession } = await import("@/lib/x-scraper");
      const exists = await hasSession();
      return NextResponse.json({ hasSession: exists });
    } catch {
      return NextResponse.json({ hasSession: false });
    }
  }

  try {
    const data = await loadScrapedPosts();
    return NextResponse.json({
      posts: data.posts,
      lastScrapedAt: data.lastScrapedAt,
      count: data.posts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load scraped data", detail: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = (body as { action?: string }).action;

  // ブラウザでログイン
  if (action === "login") {
    try {
      const { openLoginBrowser } = await import("@/lib/x-scraper");
      const result = await openLoginBrowser();
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, message: String(error) },
        { status: 500 }
      );
    }
  }

  // スクレイピング実行
  try {
    const { keywords, since, until } = body as {
      keywords?: string[];
      since?: string;
      until?: string;
    };
    const { scrapeX } = await import("@/lib/x-scraper");
    const { saveScrapedPosts } = await import("@/lib/storage");
    console.log("[api/admin/scrape] received:", { keywords, since, until, action });
    const posts = await scrapeX(keywords, since, until);
    const data = await saveScrapedPosts(posts, keywords);

    return NextResponse.json({
      posts: data.posts,
      lastScrapedAt: data.lastScrapedAt,
      newCount: posts.length,
      totalCount: data.posts.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scraping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
