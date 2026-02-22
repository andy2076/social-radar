import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /admin/login と /api/admin/auth は認証不要
  if (pathname === "/admin/login" || pathname.startsWith("/api/admin/auth")) {
    return NextResponse.next();
  }

  // /admin ページと /api/admin/* API を保護
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin")
  ) {
    const token = request.cookies.get("admin_token")?.value;
    const adminPassword = process.env.ADMIN_PASSWORD || "admin";

    if (token !== adminPassword) {
      // API の場合は 401 を返す
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "認証が必要です" },
          { status: 401 }
        );
      }
      // ページの場合はログインページにリダイレクト
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
