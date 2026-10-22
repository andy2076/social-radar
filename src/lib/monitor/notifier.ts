import { randomUUID } from "crypto";
import { AlertChannel, MonitorPost, WatchTarget } from "./types";

export interface AlertMessage {
  target: WatchTarget;
  post: Pick<MonitorPost, "content" | "posted_at" | "url" | "source">;
  riskReason: string | null;
  topic: string | null;
  dashboardUrl: string | null;
}

/** 監視対象ごとの通知先。DB（管理画面）→ 親の election → 環境変数の順でフォールバック */
export function resolveRecipients(
  target: WatchTarget,
  parent: WatchTarget | null
): Partial<Record<AlertChannel, string>> {
  const line = target.line_to || parent?.line_to || process.env.ALERT_LINE_TO || "";
  const email = target.email_to || parent?.email_to || process.env.ALERT_EMAIL_TO || "";
  const out: Partial<Record<AlertChannel, string>> = {};
  if (line && process.env.LINE_CHANNEL_ACCESS_TOKEN) out.line = line;
  if (email && process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_FROM) out.email = email;
  return out;
}

function formatText(m: AlertMessage): string {
  const posted = new Date(m.post.posted_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const body = m.post.content.length > 400 ? `${m.post.content.slice(0, 400)}…` : m.post.content;
  return [
    `【要確認】${m.target.name} に関する危険投稿を検知`,
    "",
    `理由: ${m.riskReason || "（記載なし）"}`,
    m.topic ? `話題: ${m.topic}` : null,
    `投稿日時: ${posted}${m.post.source === "mock" ? "（モックデータ）" : ""}`,
    "",
    body,
    "",
    m.post.url ? `元投稿: ${m.post.url}` : null,
    m.dashboardUrl ? `ダッシュボード: ${m.dashboardUrl}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** LINE Messaging API push。retryKey を渡すと LINE 側でも重複送信が抑止される */
async function sendLine(to: string, text: string, retryKey: string): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text: text.slice(0, 5000) }] }),
  });
  // 409 = 同じ retry key で送信済み
  if (!res.ok && res.status !== 409) {
    throw new Error(`LINE ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.ALERT_EMAIL_FROM,
      to: to.split(",").map((s) => s.trim()),
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function sendAlert(
  channel: AlertChannel,
  to: string,
  message: AlertMessage,
  retryKey: string = randomUUID()
): Promise<void> {
  const text = formatText(message);
  if (channel === "line") return sendLine(to, text, retryKey);
  return sendEmail(to, `[Social Radar] ${message.target.name}: 危険投稿を検知`, text);
}

export function dashboardUrl(targetSlug: string): string | null {
  const base = process.env.APP_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/monitor?target=${encodeURIComponent(targetSlug)}` : null;
}
