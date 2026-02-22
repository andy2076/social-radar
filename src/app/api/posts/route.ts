import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET() {
  try {
    // Try multiple paths for Vercel compatibility
    const candidates = [
      path.join(process.cwd(), "data", "scraped-posts.json"),
      path.join(process.cwd(), "..", "data", "scraped-posts.json"),
    ];

    let raw = "";
    for (const p of candidates) {
      try {
        raw = await fs.readFile(p, "utf-8");
        break;
      } catch {
        continue;
      }
    }

    if (!raw) {
      // Fallback: try import
      try {
        const data = await import("@/../data/scraped-posts.json");
        return NextResponse.json({
          posts: data.posts || [],
          lastScrapedAt: data.lastScrapedAt || "",
          count: (data.posts || []).length,
          keywords: data.keywords || [],
        });
      } catch {
        return NextResponse.json({
          posts: [],
          lastScrapedAt: "",
          count: 0,
          keywords: [],
        });
      }
    }

    const data = JSON.parse(raw);
    return NextResponse.json({
      posts: data.posts || [],
      lastScrapedAt: data.lastScrapedAt || "",
      count: (data.posts || []).length,
      keywords: data.keywords || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load data", detail: String(error) },
      { status: 500 }
    );
  }
}
