import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";
import { TargetInputSchema } from "@/lib/monitor/target-input";

export async function GET() {
  const store = await getStore();
  return NextResponse.json({ targets: await store.listTargets(), store: store.kind });
}

export async function POST(request: NextRequest) {
  const parsed = TargetInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(" / ") }, { status: 400 });
  }
  try {
    const store = await getStore();
    const target = await store.createTarget(parsed.data);
    // 選挙に候補者を追加したら、選挙の収集カーソルを戻して新しい語で直近7日ぶんを取り直す
    if (target.parent_id) await store.updateTarget(target.parent_id, { since_id: null });
    return NextResponse.json({ target });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
