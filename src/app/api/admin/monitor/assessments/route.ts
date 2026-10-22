import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/monitor/store";
import { notifyHighRisk } from "@/lib/monitor/pipeline";

const CorrectionSchema = z.object({
  postId: z.string().min(1),
  stance: z.enum(["supportive", "neutral", "critical", "hostile"]),
  risk: z.enum(["none", "low", "high"]),
  risk_reason: z.string().trim().nullish(),
  topic: z.string().trim().nullish(),
  corrected_by: z.string().trim().nullish(),
});

/** 分類結果の人手修正。モデルの判定（original）は残したまま human 行を追記する */
export async function POST(request: NextRequest) {
  const parsed = CorrectionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" / ") }, { status: 400 });
  }
  const { postId, ...c } = parsed.data;
  const store = await getStore();
  const post = await store.getPost(postId);
  if (!post) return NextResponse.json({ error: "投稿が見つかりません" }, { status: 404 });

  const previous = await store.getCurrentAssessment(postId);
  const assessment = await store.insertAssessment({
    post_id: postId,
    stance: c.stance,
    risk: c.risk,
    risk_reason: c.risk_reason || null,
    topic: c.topic || null,
    model: "human",
    source: "human",
    corrects_id: previous?.id ?? null,
    corrected_by: c.corrected_by || null,
  });
  // 人が high に引き上げた場合も通知する（通知済みなら alerts で抑止）
  const alerts = assessment.risk === "high" ? await notifyHighRisk(store, postId) : [];
  return NextResponse.json({ assessment, alerts });
}
