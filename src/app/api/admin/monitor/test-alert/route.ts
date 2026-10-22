import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";
import { resolveRecipients, sendAlert } from "@/lib/monitor/notifier";

/** 通知先の疎通確認。alerts テーブルには記録しない */
export async function POST(request: NextRequest) {
  const { targetId } = (await request.json().catch(() => ({}))) as { targetId?: string };
  const store = await getStore();
  const target = targetId ? await store.getTarget(targetId) : null;
  if (!target) return NextResponse.json({ error: "監視対象が見つかりません" }, { status: 404 });
  const parent = target.parent_id ? await store.getTarget(target.parent_id) : null;
  const recipients = resolveRecipients(target, parent);
  if (Object.keys(recipients).length === 0) {
    return NextResponse.json(
      { error: "通知先が未設定です（LINE_CHANNEL_ACCESS_TOKEN と通知先ID、またはメール設定を確認）" },
      { status: 400 }
    );
  }

  const results = [];
  for (const [channel, to] of Object.entries(recipients) as ["line" | "email", string][]) {
    try {
      await sendAlert(channel, to, {
        target,
        post: {
          content: "これは通知テストです。実際の投稿ではありません。",
          posted_at: new Date().toISOString(),
          url: null,
          source: "mock",
        },
        riskReason: "通知テスト",
        topic: null,
        dashboardUrl: null,
      });
      results.push({ channel, ok: true });
    } catch (error) {
      results.push({ channel, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return NextResponse.json({ results });
}
