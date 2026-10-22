import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/monitor/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Vercel Cron から呼ばれる（vercel.json）。cron は短い間隔で起動し、
 * 実際の収集間隔は MONITOR_INTERVAL_MINUTES で調整する。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? request.headers.get("authorization") === `Bearer ${secret}`
    : process.env.NODE_ENV !== "production";
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await runCycle();
  console.log("[cron/monitor]", JSON.stringify(report));
  return NextResponse.json(report);
}
