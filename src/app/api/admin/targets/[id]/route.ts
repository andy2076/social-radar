import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";
import { TargetPatchSchema } from "@/lib/monitor/target-input";
import { WatchTarget } from "@/lib/monitor/types";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = TargetPatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" / ") }, { status: 400 });
  }
  try {
    const store = await getStore();
    const before = await store.getTarget(id);
    if (!before) return NextResponse.json({ error: "監視対象が見つかりません" }, { status: 404 });

    const patch: Partial<WatchTarget> = { ...parsed.data };
    const queriesChanged =
      parsed.data.queries && parsed.data.queries.join("\n") !== before.queries.join("\n");
    const parentChanged = parsed.data.parent_id !== undefined && parsed.data.parent_id !== before.parent_id;
    if (queriesChanged || parentChanged) {
      // 検索語が変わったら収集カーソルを戻し、直近7日ぶんを取り直す（既存投稿は重複排除される）
      patch.since_id = null;
      const rootId = (parsed.data.parent_id ?? before.parent_id) || id;
      if (rootId !== id) await store.updateTarget(rootId, { since_id: null });
      if (before.parent_id && before.parent_id !== rootId) await store.updateTarget(before.parent_id, { since_id: null });
    }
    const target = await store.updateTarget(id, patch);
    return NextResponse.json({ target });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  await store.deleteTarget(id);
  return NextResponse.json({ success: true });
}
