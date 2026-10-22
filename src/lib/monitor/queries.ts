import { WatchTarget } from "./types";

/** X API recent search のクエリ長上限（Basic / 従量課金は 512、Pro は 1024） */
const MAX_QUERY_LENGTH = Number(process.env.X_QUERY_MAX_LENGTH || 512);
const QUERY_SUFFIX = " -is:retweet lang:ja";

/** 演算子を含む語（from:, "...", 括弧など）はそのまま、それ以外で空白を含む語は "" で囲む */
function formatTerm(term: string): string {
  const t = term.trim();
  if (/[":()]/.test(t) || !/\s/.test(t)) return t;
  return `"${t}"`;
}

/** 語の集合を OR で結合し、長さ上限に収まるよう複数クエリに分割する */
export function buildQueries(terms: string[]): string[] {
  const unique = [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
  const budget = MAX_QUERY_LENGTH - QUERY_SUFFIX.length - 2; // 括弧ぶん
  const chunks: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const term of unique.map(formatTerm)) {
    const add = (current.length ? 4 : 0) + term.length; // " OR "
    if (current.length && length + add > budget) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(term);
    length += current.length === 1 ? term.length : add;
  }
  if (current.length) chunks.push(current);
  return chunks.map((c) => `(${c.join(" OR ")})${QUERY_SUFFIX}`);
}

/** buildQueries の逆。モック検索で使う */
export function parseQueryTerms(query: string): string[] {
  const body = query.replace(QUERY_SUFFIX, "").replace(/^\(|\)$/g, "");
  return body
    .split(/\s+OR\s+/)
    .map((t) => t.replace(/^"|"$/g, "").trim())
    .filter((t) => t && !t.includes(":"));
}

function normalize(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 投稿本文がその候補者の語（名前・表記ゆれ・陣営ワード）に一致するか */
export function matchesTarget(target: WatchTarget, text: string): boolean {
  const body = normalize(text);
  return target.queries.some((q) => {
    const term = normalize(q.replace(/"/g, ""));
    // 演算子付きの語（from:xxx 等）は本文照合できないので対象外
    return term.length > 0 && !term.includes(":") && body.includes(term);
  });
}

export interface CollectUnit {
  /** since_id / last_collected_at を持つ対象（election、または親のない candidate） */
  root: WatchTarget;
  /** 本文照合で振り分ける候補者 */
  candidates: WatchTarget[];
  queries: string[];
}

/**
 * 選挙区単位で1回の検索にまとめる。
 * - election: 選挙名 + 配下の候補者の語をまとめて検索し、本文照合で候補者へ振り分け
 * - 親のない candidate: 自分の語だけで検索
 */
export function planCollection(targets: WatchTarget[]): CollectUnit[] {
  const active = targets.filter((t) => t.active);
  const activeIds = new Set(active.map((t) => t.id));
  const units: CollectUnit[] = [];

  for (const election of active.filter((t) => t.kind === "election")) {
    const candidates = active.filter((t) => t.kind === "candidate" && t.parent_id === election.id);
    const terms = [...election.queries, ...candidates.flatMap((c) => c.queries)];
    if (terms.length) units.push({ root: election, candidates, queries: buildQueries(terms) });
  }
  for (const c of active.filter(
    (t) => t.kind === "candidate" && (!t.parent_id || !activeIds.has(t.parent_id))
  )) {
    if (c.queries.length) units.push({ root: c, candidates: [c], queries: buildQueries(c.queries) });
  }
  return units;
}

/** 投稿をどの監視対象に紐付けるか。primary は posts.target_id に入る */
export function assignTargets(unit: CollectUnit, text: string): { primary: string; all: string[] } {
  const matched = unit.candidates.filter((c) => matchesTarget(c, text)).map((c) => c.id);
  const all = new Set(matched);
  if (unit.root.kind === "election") all.add(unit.root.id);
  // 親なし candidate の検索結果は本文に語が無くても（ハッシュタグ等で）その候補者に紐付ける
  if (unit.root.kind === "candidate") all.add(unit.root.id);
  return { primary: matched[0] ?? unit.root.id, all: [...all] };
}
