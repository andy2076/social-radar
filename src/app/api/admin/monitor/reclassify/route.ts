import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";
import { classifyAndStore, notifyHighRisk } from "@/lib/monitor/pipeline";

export const maxDuration = 60;

/** 手動の再分類（Claude API を1回呼ぶ）。自動では再分類しない */
export async function POST(request: NextRequest) {
  const { postId } = (await request.json().catch(() => ({}))) as { postId?: string };
  const store = await getStore();
  const post = postId ? await store.getPost(postId) : null;
  if (!post) return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });

  try {
    const targetsById = new Map((await store.listTargets()).map((t) => [t.id, t]));
    const assessment = await classifyAndStore(store, post, targetsById, new Map());
    const alerts = assessment.risk === "high" ? await notifyHighRisk(store, post.id) : [];
    return NextResponse.json({ assessment, alerts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updatePost(post.id, { classify_error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
