import { NextRequest, NextResponse } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { password } = body as { password?: string };

  if (!password || password !== ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "パスワードが正しくありません" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_token", ADMIN_PASSWORD, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("admin_token");
  return response;
}
