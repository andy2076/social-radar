import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
// 候補者監視の画面を見るだけのパスワード（陣営向け）。未設定なら閲覧専用ログインは無効
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24, // 24 hours
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  if (password && password === ADMIN_PASSWORD) {
    const response = NextResponse.json({ success: true, role: "admin" });
    response.cookies.set("admin_token", ADMIN_PASSWORD, cookieOptions);
    response.cookies.delete("viewer_token");
    return response;
  }

  if (password && VIEWER_PASSWORD && password === VIEWER_PASSWORD) {
    const response = NextResponse.json({ success: true, role: "viewer" });
    response.cookies.set("viewer_token", VIEWER_PASSWORD, cookieOptions);
    return response;
  }

  return NextResponse.json(
    { error: "パスワードが正しくありません" },
    { status: 401 }
  );
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("admin_token");
  response.cookies.delete("viewer_token");
  return response;
}
