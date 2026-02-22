import { NextResponse } from "next/server";
import { loadScrapedPosts } from "@/lib/storage";

// 後方互換: /api/posts に移行済み。GETのみ残す。
export async function GET() {
  try {
    const data = await loadScrapedPosts();
    return NextResponse.json({
      posts: data.posts,
      lastScrapedAt: data.lastScrapedAt,
      count: data.posts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load data", detail: String(error) },
      { status: 500 }
    );
  }
}
