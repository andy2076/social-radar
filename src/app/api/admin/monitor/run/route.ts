import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/monitor/pipeline";

export const maxDuration = 300;

/** 管理画面からの手動実行（収集間隔を無視して即時実行） */
export async function POST(request: NextRequest) {
  const { force = true } = (await request.json().catch(() => ({}))) as { force?: boolean };
  try {
    return NextResponse.json(await runCycle({ force }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
