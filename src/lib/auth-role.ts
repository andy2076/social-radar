import type { NextRequest } from "next/server";

export type Role = "admin" | "viewer";

/**
 * cookie から権限を判定する。
 * - admin: ADMIN_PASSWORD でログイン。すべての操作ができる
 * - viewer: VIEWER_PASSWORD でログイン。候補者監視の画面を見るだけ
 */
export function getRole(request: Pick<NextRequest, "cookies">): Role | null {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin";
  if (request.cookies.get("admin_token")?.value === adminPassword) return "admin";
  const viewerPassword = process.env.VIEWER_PASSWORD;
  if (viewerPassword && request.cookies.get("viewer_token")?.value === viewerPassword) return "viewer";
  return null;
}

/** 閲覧専用ユーザーが呼べる API（GET のみ） */
export const VIEWER_APIS = ["/api/admin/monitor/posts"];
