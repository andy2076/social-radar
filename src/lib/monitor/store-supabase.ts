import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { MonitorStore, PostQuery } from "./store";
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

const PAGE = 1000;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`[supabase] ${res.error.message}`);
  return res.data as T;
}

/** サーバー専用（service role key を使う）。ブラウザから import しないこと */
export class SupabaseStore implements MonitorStore {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async listTargets() {
    return check<WatchTarget[]>(
      await this.db.from("watch_targets").select("*").order("created_at")
    );
  }

  async getTarget(id: string) {
    return check<WatchTarget | null>(
      await this.db.from("watch_targets").select("*").eq("id", id).maybeSingle()
    );
  }

  async createTarget(input: WatchTargetInput) {
    return check<WatchTarget>(
      await this.db.from("watch_targets").insert(input).select().single()
    );
  }

  async updateTarget(id: string, patch: Partial<WatchTarget>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, ...rest } = patch;
    return check<WatchTarget>(
      await this.db.from("watch_targets").update(rest).eq("id", id).select().single()
    );
  }

  async deleteTarget(id: string) {
    check(await this.db.from("watch_targets").delete().eq("id", id));
  }

  async insertPosts(items: { post: NewPost; targetIds: string[] }[]) {
    if (items.length === 0) return [];
    const externalIds = items.map((i) => i.post.external_id);

    type Metrics = Pick<MonitorPost, "likes" | "retweets" | "replies" | "impressions">;
    type Kind = Pick<MonitorPost, "post_kind" | "reply_to">;
    const existing = check<({ id: string; external_id: string } & Metrics & Kind)[]>(
      await this.db
        .from("posts")
        .select("id, external_id, likes, retweets, replies, impressions, post_kind, reply_to")
        .in("external_id", externalIds)
    );
    const existingIds = new Set(existing.map((e) => e.external_id));

    // 同一バッチ内の重複も除く
    const toInsert = new Map<string, NewPost>();
    for (const { post } of items) {
      if (!existingIds.has(post.external_id)) toInsert.set(post.external_id, post);
    }

    // 既存投稿は数字が変わったものだけ更新する
    const latest = new Map(items.map(({ post }) => [post.external_id, post]));
    const changed = existing.flatMap((e) => {
      const p = latest.get(e.external_id)!;
      const m: Metrics & Partial<Kind> = { likes: p.likes, retweets: p.retweets, replies: p.replies, impressions: p.impressions };
      const same = (Object.keys(m) as (keyof Metrics)[]).every((k) => m[k] === e[k]);
      // 言及として先に入っていた本人投稿・リプライは種別を付け直す
      const reKind = p.post_kind !== "mention" && e.post_kind === "mention";
      if (reKind) Object.assign(m, { post_kind: p.post_kind, reply_to: p.reply_to });
      return same && !reKind ? [] : [{ id: e.id, m }];
    });
    for (const { id, m } of changed) {
      check(await this.db.from("posts").update(m).eq("id", id));
    }

    let inserted: MonitorPost[] = [];
    if (toInsert.size > 0) {
      inserted = check<MonitorPost[]>(
        await this.db
          .from("posts")
          .upsert([...toInsert.values()], { onConflict: "external_id", ignoreDuplicates: true })
          .select()
      );
    }

    const idByExternal = new Map<string, string>([
      ...existing.map((e) => [e.external_id, e.id] as [string, string]),
      ...inserted.map((p) => [p.external_id, p.id] as [string, string]),
    ]);
    const links = items.flatMap(({ post, targetIds }) => {
      const postId = idByExternal.get(post.external_id);
      return postId ? targetIds.map((target_id) => ({ post_id: postId, target_id })) : [];
    });
    if (links.length > 0) {
      check(
        await this.db
          .from("post_targets")
          .upsert(links, { onConflict: "post_id,target_id", ignoreDuplicates: true })
      );
    }
    return inserted;
  }

  async getPost(id: string) {
    return check<MonitorPost | null>(
      await this.db.from("posts").select("*").eq("id", id).maybeSingle()
    );
  }

  async getPostByExternalId(externalId: string) {
    return check<MonitorPost | null>(
      await this.db.from("posts").select("*").eq("external_id", externalId).maybeSingle()
    );
  }

  async getPostTargetIds(postId: string) {
    const rows = check<{ target_id: string }[]>(
      await this.db.from("post_targets").select("target_id").eq("post_id", postId)
    );
    return rows.map((r) => r.target_id);
  }

  async claimUnclassified(limit: number) {
    return check<MonitorPost[]>(
      await this.db.rpc("claim_unclassified_posts", { p_limit: limit })
    );
  }

  async updatePost(id: string, patch: Partial<MonitorPost>) {
    check(await this.db.from("posts").update(patch).eq("id", id));
  }

  async insertAssessment(a: NewAssessment) {
    return check<Assessment>(
      await this.db.from("post_assessments").insert(a).select().single()
    );
  }

  async getCurrentAssessment(postId: string) {
    return check<Assessment | null>(
      await this.db.from("post_assessment_current").select("*").eq("post_id", postId).maybeSingle()
    );
  }

  async listPostRows(q: PostQuery) {
    const rows: MonitorPostRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = this.db
        .from("monitor_post_view")
        .select("*")
        .in("target_id", q.targetIds)
        .order("posted_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (q.since) query = query.gte("posted_at", q.since);
      if (q.until) query = query.lte("posted_at", q.until);
      const page = check<MonitorPostRow[]>(await query);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows;
  }

  async reserveAlert(a: { target_id: string | null; post_id: string; channel: AlertChannel }) {
    const rows = check<Alert[]>(
      await this.db
        .from("alerts")
        .upsert({ ...a, level: "high" }, { onConflict: "post_id,channel", ignoreDuplicates: true })
        .select()
    );
    return rows[0] ?? null;
  }

  async updateAlert(id: string, patch: Partial<Alert>) {
    check(await this.db.from("alerts").update(patch).eq("id", id));
  }

  async listUnsentAlerts() {
    return check<Alert[]>(await this.db.from("alerts").select("*").is("sent_at", null));
  }
}
