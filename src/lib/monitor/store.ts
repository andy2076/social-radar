import {
  Alert,
  AlertChannel,
  Assessment,
  MonitorPost,
  MonitorPostRow,
  NewAssessment,
  NewPost,
  WatchTarget,
  WatchTargetInput,
} from "./types";

export interface PostQuery {
  targetIds: string[];
  since?: string; // ISO
  until?: string; // ISO
}

/**
 * 監視データの永続化層。
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY があれば Supabase、無ければ data/monitor-db.json（ローカル用モック）。
 */
export interface MonitorStore {
  readonly kind: "supabase" | "file";

  listTargets(): Promise<WatchTarget[]>;
  getTarget(id: string): Promise<WatchTarget | null>;
  createTarget(input: WatchTargetInput): Promise<WatchTarget>;
  updateTarget(id: string, patch: Partial<WatchTarget>): Promise<WatchTarget>;
  deleteTarget(id: string): Promise<void>;

  /** external_id で重複排除して保存し、新規に入った投稿を返す。既存投稿は targetIds の紐付け追加といいね・表示回数などの更新のみ */
  insertPosts(items: { post: NewPost; targetIds: string[] }[]): Promise<MonitorPost[]>;
  getPost(id: string): Promise<MonitorPost | null>;
  getPostByExternalId(externalId: string): Promise<MonitorPost | null>;
  getPostTargetIds(postId: string): Promise<string[]>;
  /** 未分類の監視投稿を確保（並行実行で二重分類しない） */
  claimUnclassified(limit: number): Promise<MonitorPost[]>;
  updatePost(id: string, patch: Partial<MonitorPost>): Promise<void>;

  insertAssessment(a: NewAssessment): Promise<Assessment>;
  getCurrentAssessment(postId: string): Promise<Assessment | null>;
  listPostRows(q: PostQuery): Promise<MonitorPostRow[]>;

  /** (post_id, channel) が未登録なら作成して返す。既にあれば null */
  reserveAlert(a: { target_id: string | null; post_id: string; channel: AlertChannel }): Promise<Alert | null>;
  updateAlert(id: string, patch: Partial<Alert>): Promise<void>;
  listUnsentAlerts(): Promise<Alert[]>;
}

let cached: MonitorStore | null = null;

export async function getStore(): Promise<MonitorStore> {
  if (cached) return cached;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseStore } = await import("./store-supabase");
    cached = new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    const { FileStore } = await import("./store-file");
    cached = new FileStore();
  }
  return cached;
}

/** 人手修正 > 最新のモデル判定 */
export function pickCurrent(list: Assessment[]): Assessment | null {
  const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted.find((a) => a.source === "human") ?? sorted[0] ?? null;
}

export function pickOriginal(list: Assessment[]): Assessment | null {
  return (
    list
      .filter((a) => a.source === "model")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
  );
}

export const CLAIM_STALE_MS = 30 * 60 * 1000;
