import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { CLAIM_STALE_MS, MonitorStore, PostQuery, pickCurrent, pickOriginal } from "./store";
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

const DB_FILE = path.join(process.cwd(), "data", "monitor-db.json");

interface Db {
  watch_targets: WatchTarget[];
  posts: MonitorPost[];
  post_targets: { post_id: string; target_id: string }[];
  post_assessments: Assessment[];
  alerts: Alert[];
}

const emptyDb = (): Db => ({
  watch_targets: [],
  posts: [],
  post_targets: [],
  post_assessments: [],
  alerts: [],
});

/**
 * Supabase 未設定時のローカル用ストア。単一プロセス前提（next dev / スクリプト）。
 * Vercel 上ではファイルシステムが読み取り専用のため使えない。
 */
export class FileStore implements MonitorStore {
  readonly kind = "file" as const;

  private async read(): Promise<Db> {
    try {
      return { ...emptyDb(), ...JSON.parse(await fs.readFile(DB_FILE, "utf-8")) };
    } catch {
      return emptyDb();
    }
  }

  /** 読み→変更→書きを直列化する（next dev ではルートごとにモジュールが分かれるので globalThis で共有） */
  private tx<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    const g = globalThis as { __monitorDbQueue?: Promise<unknown> };
    const run = (g.__monitorDbQueue ?? Promise.resolve()).then(async () => {
      const db = await this.read();
      const result = await fn(db);
      await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
      return result;
    });
    g.__monitorDbQueue = run.catch(() => {});
    return run;
  }

  async listTargets() {
    const db = await this.read();
    return [...db.watch_targets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async getTarget(id: string) {
    return (await this.read()).watch_targets.find((t) => t.id === id) ?? null;
  }

  createTarget(input: WatchTargetInput) {
    return this.tx((db) => {
      if (db.watch_targets.some((t) => t.slug === input.slug)) {
        throw new Error(`slug "${input.slug}" は既に使われています`);
      }
      const target: WatchTarget = {
        ...input,
        id: randomUUID(),
        since_id: null,
        last_collected_at: null,
        created_at: new Date().toISOString(),
      };
      db.watch_targets.push(target);
      return target;
    });
  }

  updateTarget(id: string, patch: Partial<WatchTarget>) {
    return this.tx((db) => {
      const t = db.watch_targets.find((x) => x.id === id);
      if (!t) throw new Error("監視対象が見つかりません");
      if (patch.slug && db.watch_targets.some((x) => x.slug === patch.slug && x.id !== id)) {
        throw new Error(`slug "${patch.slug}" は既に使われています`);
      }
      Object.assign(t, patch, { id });
      return { ...t };
    });
  }

  deleteTarget(id: string) {
    return this.tx((db) => {
      db.watch_targets = db.watch_targets.filter((t) => t.id !== id);
      for (const t of db.watch_targets) if (t.parent_id === id) t.parent_id = null;
      for (const p of db.posts) if (p.target_id === id) p.target_id = null;
      db.post_targets = db.post_targets.filter((pt) => pt.target_id !== id);
      for (const a of db.alerts) if (a.target_id === id) a.target_id = null;
    });
  }

  insertPosts(items: { post: NewPost; targetIds: string[] }[]) {
    return this.tx((db) => {
      const byExternal = new Map(db.posts.map((p) => [p.external_id, p]));
      const links = new Set(db.post_targets.map((pt) => `${pt.post_id}:${pt.target_id}`));
      const inserted: MonitorPost[] = [];
      for (const { post, targetIds } of items) {
        let row = byExternal.get(post.external_id);
        if (!row) {
          row = {
            ...post,
            id: randomUUID(),
            collected_at: new Date().toISOString(),
            classify_claimed_at: null,
            classified_at: null,
            classify_error: null,
          };
          db.posts.push(row);
          byExternal.set(row.external_id, row);
          inserted.push(row);
        } else {
          const { likes, retweets, replies, impressions } = post;
          Object.assign(row, { likes, retweets, replies, impressions });
          // 言及として先に入っていた本人投稿・リプライは種別を付け直す
          if (post.post_kind !== "mention" && (row.post_kind ?? "mention") === "mention") {
            Object.assign(row, { post_kind: post.post_kind, reply_to: post.reply_to });
          }
        }
        for (const targetId of targetIds) {
          const key = `${row.id}:${targetId}`;
          if (!links.has(key)) {
            links.add(key);
            db.post_targets.push({ post_id: row.id, target_id: targetId });
          }
        }
      }
      return inserted;
    });
  }

  async getPost(id: string) {
    return (await this.read()).posts.find((p) => p.id === id) ?? null;
  }

  async getPostByExternalId(externalId: string) {
    return (await this.read()).posts.find((p) => p.external_id === externalId) ?? null;
  }

  async getPostTargetIds(postId: string) {
    return (await this.read()).post_targets.filter((pt) => pt.post_id === postId).map((pt) => pt.target_id);
  }

  claimUnclassified(limit: number) {
    return this.tx((db) => {
      const staleBefore = Date.now() - CLAIM_STALE_MS;
      const claimed = db.posts
        .filter(
          (p) =>
            !p.classified_at &&
            !p.classify_error &&
            p.target_id &&
            p.post_kind !== "own" &&
            (!p.classify_claimed_at || Date.parse(p.classify_claimed_at) < staleBefore)
        )
        .sort((a, b) => a.collected_at.localeCompare(b.collected_at))
        .slice(0, limit);
      const now = new Date().toISOString();
      for (const p of claimed) p.classify_claimed_at = now;
      return claimed.map((p) => ({ ...p }));
    });
  }

  updatePost(id: string, patch: Partial<MonitorPost>) {
    return this.tx((db) => {
      const p = db.posts.find((x) => x.id === id);
      if (p) Object.assign(p, patch, { id });
    });
  }

  insertAssessment(a: NewAssessment) {
    return this.tx((db) => {
      const row: Assessment = { ...a, id: randomUUID(), created_at: new Date().toISOString() };
      db.post_assessments.push(row);
      return row;
    });
  }

  async getCurrentAssessment(postId: string) {
    return pickCurrent((await this.read()).post_assessments.filter((a) => a.post_id === postId));
  }

  async listPostRows(q: PostQuery): Promise<MonitorPostRow[]> {
    const db = await this.read();
    const posts = new Map(db.posts.map((p) => [p.id, p]));
    const assessments = new Map<string, Assessment[]>();
    for (const a of db.post_assessments) {
      const list = assessments.get(a.post_id) ?? [];
      list.push(a);
      assessments.set(a.post_id, list);
    }
    const targetIds = new Set(q.targetIds);
    const rows: MonitorPostRow[] = [];
    for (const pt of db.post_targets) {
      if (!targetIds.has(pt.target_id)) continue;
      const p = posts.get(pt.post_id);
      if (!p) continue;
      if (q.since && p.posted_at < q.since) continue;
      if (q.until && p.posted_at > q.until) continue;
      const list = assessments.get(p.id) ?? [];
      const cur = pickCurrent(list);
      const orig = pickOriginal(list);
      rows.push({
        target_id: pt.target_id,
        id: p.id,
        external_id: p.external_id,
        primary_target_id: p.target_id,
        source: p.source,
        content: p.content,
        posted_at: p.posted_at,
        author_id: p.author_id,
        post_kind: p.post_kind ?? "mention",
        reply_to: p.reply_to ?? null,
        url: p.url,
        likes: p.likes,
        retweets: p.retweets,
        replies: p.replies,
        impressions: p.impressions,
        classified_at: p.classified_at,
        classify_error: p.classify_error,
        assessment_id: cur?.id ?? null,
        stance: cur?.stance ?? null,
        risk: cur?.risk ?? null,
        risk_reason: cur?.risk_reason ?? null,
        topic: cur?.topic ?? null,
        model: cur?.model ?? null,
        assessment_source: cur?.source ?? null,
        original_stance: orig?.stance ?? null,
        original_risk: orig?.risk ?? null,
        original_topic: orig?.topic ?? null,
      });
    }
    return rows.sort((a, b) => b.posted_at.localeCompare(a.posted_at));
  }

  reserveAlert(a: { target_id: string | null; post_id: string; channel: AlertChannel }) {
    return this.tx((db) => {
      if (db.alerts.some((x) => x.post_id === a.post_id && x.channel === a.channel)) return null;
      const row: Alert = {
        ...a,
        id: randomUUID(),
        level: "high",
        sent_at: null,
        error: null,
        created_at: new Date().toISOString(),
      };
      db.alerts.push(row);
      return row;
    });
  }

  updateAlert(id: string, patch: Partial<Alert>) {
    return this.tx((db) => {
      const a = db.alerts.find((x) => x.id === id);
      if (a) Object.assign(a, patch, { id });
    });
  }

  async listUnsentAlerts() {
    return (await this.read()).alerts.filter((a) => !a.sent_at);
  }
}
