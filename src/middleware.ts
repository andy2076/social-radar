import { NextRequest, NextResponse } from "next/server";
import { getRole, VIEWER_APIS } from "@/lib/auth-role";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /admin/login と /api/admin/auth は認証不要
  if (pathname === "/admin/login" || pathname.startsWith("/api/admin/auth")) {
    return NextResponse.next();
  }

  // 候補者監視（/ と /compare）・/admin ページと /api/admin/* API を保護。
  // 地域分析（/monitor）は公開のまま
  const isCandidatePage = pathname === "/" || pathname.startsWith("/compare");
  if (isCandidatePage || pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const role = getRole(request);
    // 閲覧専用ユーザーは監視画面と、その表示に使う読み取り API だけ
    const viewerAllowed =
      isCandidatePage ||
      (request.method === "GET" && VIEWER_APIS.includes(pathname));
    const allowed = role === "admin" || (role === "viewer" && viewerAllowed);

    if (!allowed) {
      // API の場合は 401 / 403 を返す
      if (pathname.startsWith("/api/")) {
        return role
          ? NextResponse.json({ error: "閲覧専用のアカウントでは操作できません" }, { status: 403 })
          : NextResponse.json({ error: "認証が必要です" }, { status: 401 });
      }
      // ページの場合はログインページにリダイレクト
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/compare/:path*", "/admin/:path*", "/api/admin/:path*"],
};
