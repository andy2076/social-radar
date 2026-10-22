import { NextRequest, NextResponse } from "next/server";
import { buildQueries } from "@/lib/monitor/queries";
import { getXClient } from "@/lib/monitor/x-api";

/** 保存前のテスト検索。結果は保存しない */
export async function POST(request: NextRequest) {
  const { queries } = (await request.json().catch(() => ({}))) as { queries?: string[] };
  const terms = (queries ?? []).map((q) => q.trim()).filter(Boolean);
  if (terms.length === 0) {
    return NextResponse.json({ error: "検索語を1つ以上入力してください" }, { status: 400 });
  }

  const built = buildQueries(terms);
  try {
    const x = await getXClient();
    const tweets = [];
    for (const q of built) {
      if (tweets.length >= 20) break;
      tweets.push(...(await x.search(q, { maxResults: 20 - tweets.length })));
    }
    tweets.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ queries: built, mock: x.mock, source: x.source, tweets: tweets.slice(0, 20) });
  } catch (error) {
    return NextResponse.json(
      { queries: built, error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
