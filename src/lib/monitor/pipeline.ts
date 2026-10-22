import { getStore, MonitorStore } from "./store";
import { assignTargets, planCollection } from "./queries";
import { getXClient, type XTweet } from "./x-api";
import { CLASSIFY_MODEL, ClassifyError, classifierAvailable, classifyPost, mockClassify } from "./classifier";
import { dashboardUrl, resolveRecipients, sendAlert } from "./notifier";
import { Assessment, MonitorPost, NewPost, PostKind, WatchTarget } from "./types";

const INTERVAL_MINUTES = Number(process.env.MONITOR_INTERVAL_MINUTES || 15);
const CLASSIFY_BATCH_SIZE = Number(process.env.CLASSIFY_BATCH_SIZE || 20);
const CLASSIFY_CONCURRENCY = Number(process.env.CLASSIFY_CONCURRENCY || 4);
// リプライを取りに行く本人投稿の数（新しい順）
const OWN_REPLY_POSTS = Number(process.env.X_OWN_REPLY_POSTS || 10);

export interface CycleReport {
  store: MonitorStore["kind"];
  xMock: boolean;
  collected: { target: string; skipped?: string; fetched?: number; inserted?: number; error?: string }[];
  classified: number;
  classifyErrors: { postId: string; error: string }[];
  classifier: "claude" | "mock" | "unavailable";
  alerts: { postId: string; channel: string; ok: boolean; error?: string }[];
}

function mockClassifierEnabled(store: MonitorStore): boolean {
  return process.env.MOCK_CLASSIFIER === "1" && store.kind === "file";
}

// --- 収集 -------------------------------------------------------------------

type XClient = Awaited<ReturnType<typeof getXClient>>;

function toNewPost(x: XClient, t: XTweet, targetId: string, kind: PostKind, replyTo: string | null = null): NewPost {
  return {
    external_id: t.id,
    target_id: targetId,
    source: x.source,
    post_kind: kind,
    reply_to: replyTo,
    content: t.text,
    posted_at: t.created_at,
    author_id: t.author_id,
    url: t.url || null,
    likes: t.likes,
    retweets: t.retweets,
    replies: t.replies,
    impressions: t.impressions,
  };
}

/** 候補者本人の投稿と、それへのリプライ。直近 OWN_WINDOW_MS 分を毎回取り直す */
async function collectOwn(x: XClient, candidate: WatchTarget, root: WatchTarget) {
  const handle = candidate.x_handle!;
  const targetIds = [...new Set([candidate.id, root.id])];
  const items: { post: NewPost; targetIds: string[] }[] = [];
  const own = await x.ownPosts(handle);
  for (const t of own) items.push({ post: toNewPost(x, t, candidate.id, "own"), targetIds });
  // リプライを見に行く本人投稿の数を抑える（新しい順）
  for (const t of own.slice(0, OWN_REPLY_POSTS)) {
    for (const r of await x.replies(handle, t.id)) {
      items.push({ post: toNewPost(x, r, candidate.id, "reply", t.id), targetIds });
    }
  }
  return items;
}

export async function collect(store: MonitorStore, force: boolean, report: CycleReport) {
  let x: XClient;
  try {
    x = await getXClient();
  } catch (error) {
    report.collected.push({ target: "収集", error: error instanceof Error ? error.message : String(error) });
    return;
  }
  report.xMock = x.mock;
  const targets = await store.listTargets();
  const due = Date.now() - INTERVAL_MINUTES * 60 * 1000;

  for (const unit of planCollection(targets)) {
    const { root } = unit;
    if (!force && root.last_collected_at && Date.parse(root.last_collected_at) > due) {
      report.collected.push({ target: root.name, skipped: `間隔 ${INTERVAL_MINUTES}分 未満` });
      continue;
    }
    try {
      const startedAt = new Date().toISOString();
      // 本人の投稿・リプライを先に保存する（言及検索でも同じ投稿が拾われるため、種別を先に確定させる）
      for (const c of unit.candidates.filter((c) => c.x_handle)) {
        const ownItems = await collectOwn(x, c, root);
        const inserted = await store.insertPosts(ownItems);
        const ownCount = ownItems.filter((i) => i.post.post_kind === "own").length;
        report.collected.push({
          target: `${c.name}（本人 ${ownCount}件・リプライ ${ownItems.length - ownCount}件）`,
          fetched: ownItems.length,
          inserted: inserted.length,
        });
      }

      const items: { post: NewPost; targetIds: string[] }[] = [];
      let newestId = root.since_id;
      for (const query of unit.queries) {
        const tweets = await x.search(query, { sinceId: root.since_id });
        for (const t of tweets) {
          const { primary, all } = assignTargets(unit, t.text);
          items.push({ post: toNewPost(x, t, primary, "mention"), targetIds: all });
          if (!newestId || BigInt(t.id) > BigInt(newestId)) newestId = t.id;
        }
      }
      const inserted = await store.insertPosts(items);
      await store.updateTarget(root.id, { since_id: newestId, last_collected_at: startedAt });
      report.collected.push({ target: root.name, fetched: items.length, inserted: inserted.length });
    } catch (error) {
      report.collected.push({ target: root.name, error: String(error instanceof Error ? error.message : error) });
    }
  }
}

// --- 分類 -------------------------------------------------------------------

async function knownTopicsFor(store: MonitorStore, targetId: string): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await store.listPostRows({ targetIds: [targetId], since });
  const counts = new Map<string, number>();
  for (const r of rows) if (r.topic) counts.set(r.topic, (counts.get(r.topic) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
}

/** 1投稿を分類して保存。auto=false は管理画面からの手動再分類 */
export async function classifyAndStore(
  store: MonitorStore,
  post: MonitorPost,
  targetsById: Map<string, WatchTarget>,
  topicCache: Map<string, string[]>
): Promise<Assessment> {
  const linked = await store.getPostTargetIds(post.id);
  const ordered = [post.target_id, ...linked.filter((id) => id !== post.target_id)]
    .map((id) => (id ? targetsById.get(id) : undefined))
    .filter((t): t is WatchTarget => Boolean(t));

  const primaryId = post.target_id ?? "";
  if (!topicCache.has(primaryId)) topicCache.set(primaryId, await knownTopicsFor(store, primaryId));
  const known = topicCache.get(primaryId)!;

  const mock = mockClassifierEnabled(store);
  const parent = post.reply_to ? await store.getPostByExternalId(post.reply_to) : null;
  const result = mock ? mockClassify(post.content) : await classifyPost(post, ordered, known, parent?.content ?? null);
  if (result.topic && !known.includes(result.topic)) known.push(result.topic);

  const assessment = await store.insertAssessment({
    post_id: post.id,
    stance: result.stance,
    risk: result.risk,
    risk_reason: result.risk_reason || null,
    topic: result.topic || null,
    model: mock ? "mock" : CLASSIFY_MODEL,
    source: "model",
    corrects_id: null,
    corrected_by: null,
  });
  await store.updatePost(post.id, { classified_at: assessment.created_at, classify_error: null });
  return assessment;
}

export async function classifyPending(store: MonitorStore, report: CycleReport) {
  if (mockClassifierEnabled(store)) report.classifier = "mock";
  else if (classifierAvailable()) report.classifier = "claude";
  else {
    report.classifier = "unavailable";
    return;
  }

  const posts = await store.claimUnclassified(CLASSIFY_BATCH_SIZE);
  if (posts.length === 0) return;
  const targetsById = new Map((await store.listTargets()).map((t) => [t.id, t]));
  const topicCache = new Map<string, string[]>();

  const queue = [...posts];
  const worker = async () => {
    for (let post = queue.shift(); post; post = queue.shift()) {
      try {
        const a = await classifyAndStore(store, post, targetsById, topicCache);
        report.classified++;
        if (a.risk === "high") report.alerts.push(...(await notifyHighRisk(store, post.id)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.classifyErrors.push({ postId: post.id, error: message });
        if (error instanceof ClassifyError && error.retryable) {
          // 一時的な失敗は確保を解除して次回に回す（成功するまで1投稿1回の原則は保つ）
          await store.updatePost(post.id, { classify_claimed_at: null });
          if (error.fatal) {
            // 残りを呼んでも同じエラーになるので打ち切る
            for (const rest of queue.splice(0)) await store.updatePost(rest.id, { classify_claimed_at: null });
          }
        } else {
          // 拒否・形式不正などは自動リトライしない。管理画面から手動で再分類する
          await store.updatePost(post.id, { classify_error: message });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CLASSIFY_CONCURRENCY }, worker));
}

// --- 通知 -------------------------------------------------------------------

/** 有効な分類が risk=high なら、未通知のチャネルに通知する（alerts の一意制約で重複抑止） */
export async function notifyHighRisk(store: MonitorStore, postId: string) {
  const results: CycleReport["alerts"] = [];
  const post = await store.getPost(postId);
  const current = await store.getCurrentAssessment(postId);
  if (!post || !post.target_id || current?.risk !== "high") return results;

  const target = await store.getTarget(post.target_id);
  if (!target) return results;
  const parent = target.parent_id ? await store.getTarget(target.parent_id) : null;
  const recipients = resolveRecipients(target, parent);

  for (const [channel, to] of Object.entries(recipients) as [keyof typeof recipients, string][]) {
    const alert = await store.reserveAlert({ target_id: target.id, post_id: post.id, channel });
    if (!alert) continue; // 通知済み
    results.push(await deliver(store, alert.id, channel, to, target, post, current));
  }
  return results;
}

async function deliver(
  store: MonitorStore,
  alertId: string,
  channel: "line" | "email",
  to: string,
  target: WatchTarget,
  post: MonitorPost,
  assessment: Assessment
) {
  try {
    await sendAlert(
      channel,
      to,
      { target, post, riskReason: assessment.risk_reason, topic: assessment.topic, dashboardUrl: dashboardUrl(target.slug) },
      alertId
    );
    await store.updateAlert(alertId, { sent_at: new Date().toISOString(), error: null });
    return { postId: post.id, channel, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateAlert(alertId, { error: message });
    return { postId: post.id, channel, ok: false, error: message };
  }
}

/** 送信に失敗した通知を24時間以内なら再送する */
export async function retryFailedAlerts(store: MonitorStore, report: CycleReport) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const alert of await store.listUnsentAlerts()) {
    if (Date.parse(alert.created_at) < cutoff || !alert.target_id) continue;
    const [post, current, target] = await Promise.all([
      store.getPost(alert.post_id),
      store.getCurrentAssessment(alert.post_id),
      store.getTarget(alert.target_id),
    ]);
    if (!post || !target || current?.risk !== "high") continue;
    const parent = target.parent_id ? await store.getTarget(target.parent_id) : null;
    const to = resolveRecipients(target, parent)[alert.channel];
    if (!to) continue;
    report.alerts.push(await deliver(store, alert.id, alert.channel, to, target, post, current));
  }
}

// --- 1サイクル -------------------------------------------------------------------

export async function runCycle(opts: { force?: boolean } = {}): Promise<CycleReport> {
  const store = await getStore();
  const report: CycleReport = {
    store: store.kind,
    xMock: false,
    collected: [],
    classified: 0,
    classifyErrors: [],
    classifier: "unavailable",
    alerts: [],
  };
  await retryFailedAlerts(store, report);
  await collect(store, Boolean(opts.force), report);
  await classifyPending(store, report);
  return report;
}
