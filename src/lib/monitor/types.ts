export type TargetKind = "candidate" | "election";
export type Stance = "supportive" | "neutral" | "critical" | "hostile";
export type Risk = "none" | "low" | "high";
export type AlertChannel = "line" | "email";
/** mention: 検索で拾った言及 / own: 候補者本人の投稿 / reply: 本人の投稿へのリプライ */
export type PostKind = "mention" | "own" | "reply";


export const STANCES: Stance[] = ["supportive", "neutral", "critical", "hostile"];
export const RISKS: Risk[] = ["none", "low", "high"];

export const STANCE_LABELS: Record<Stance, string> = {
  supportive: "好意的",
  neutral: "中立",
  critical: "批判",
  hostile: "敵対的",
};

export const STANCE_COLORS: Record<Stance, string> = {
  supportive: "#34d399",
  neutral: "#a1a1aa",
  critical: "#fbbf24",
  hostile: "#f87171",
};

export const RISK_LABELS: Record<Risk, string> = {
  none: "なし",
  low: "注意",
  high: "要チェック",
};

export interface WatchTarget {
  id: string;
  name: string;
  slug: string;
  kind: TargetKind;
  parent_id: string | null;
  queries: string[];
  context: string | null;
  x_handle: string | null;
  active: boolean;
  line_to: string | null;
  email_to: string | null;
  since_id: string | null;
  last_collected_at: string | null;
  created_at: string;
}

export type WatchTargetInput = Pick<
  WatchTarget,
  "name" | "slug" | "kind" | "parent_id" | "queries" | "context" | "x_handle" | "active" | "line_to" | "email_to"
>;

export interface MonitorPost {
  id: string;
  external_id: string;
  target_id: string | null;
  source: "x_api" | "mock" | "scraped";
  content: string;
  posted_at: string;
  author_id: string | null;
  post_kind: PostKind;
  reply_to: string | null;
  url: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  collected_at: string;
  classify_claimed_at: string | null;
  classified_at: string | null;
  classify_error: string | null;
}

export type NewPost = Omit<
  MonitorPost,
  "id" | "collected_at" | "classify_claimed_at" | "classified_at" | "classify_error"
>;

export interface Assessment {
  id: string;
  post_id: string;
  stance: Stance;
  risk: Risk;
  risk_reason: string | null;
  topic: string | null;
  model: string;
  source: "model" | "human";
  corrects_id: string | null;
  corrected_by: string | null;
  created_at: string;
}

export type NewAssessment = Omit<Assessment, "id" | "created_at">;

export interface Alert {
  id: string;
  target_id: string | null;
  post_id: string;
  level: "high";
  channel: AlertChannel;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

/** monitor_post_view の1行（監視対象ごと） */
export interface MonitorPostRow {
  target_id: string;
  id: string;
  external_id: string;
  primary_target_id: string | null;
  source: MonitorPost["source"];
  content: string;
  posted_at: string;
  author_id: string | null;
  post_kind: PostKind;
  reply_to: string | null;
  url: string | null;
  likes: number;
  retweets: number;
  replies: number;
  impressions: number;
  classified_at: string | null;
  classify_error: string | null;
  assessment_id: string | null;
  stance: Stance | null;
  risk: Risk | null;
  risk_reason: string | null;
  topic: string | null;
  model: string | null;
  assessment_source: "model" | "human" | null;
  original_stance: Stance | null;
  original_risk: Risk | null;
  original_topic: string | null;
}
