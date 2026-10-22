import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";

export const dynamic = "force-dynamic";

/** ?targets=id1,id2&since=ISO&until=ISO */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const store = await getStore();
  const targets = await store.listTargets();
  const ids = (sp.get("targets") || "").split(",").filter(Boolean);
  const rows = ids.length
    ? await store.listPostRows({
        targetIds: ids,
        since: sp.get("since") || undefined,
        until: sp.get("until") || undefined,
      })
    : [];
  return NextResponse.json({ targets, rows, store: store.kind });
}
