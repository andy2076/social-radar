import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/monitor/store";
import { getRole } from "@/lib/auth-role";

export const dynamic = "force-dynamic";

/** ?targets=id1,id2&since=ISO&until=ISO */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const store = await getStore();
  const role = getRole(request);
  const all = await store.listTargets();
  // 閲覧専用には通知先・事実メモ・収集カーソルを渡さない
  const targets =
    role === "admin"
      ? all
      : all.map(({ id, name, slug, kind, parent_id, x_handle, active }) => ({ id, name, slug, kind, parent_id, x_handle, active }));
  const ids = (sp.get("targets") || "").split(",").filter(Boolean);
  const rows = ids.length
    ? await store.listPostRows({
        targetIds: ids,
        since: sp.get("since") || undefined,
        until: sp.get("until") || undefined,
      })
    : [];
  return NextResponse.json({ targets, rows, store: store.kind, role });
}
