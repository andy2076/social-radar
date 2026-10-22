"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WatchTarget } from "@/lib/monitor/types";

type Draft = {
  id?: string;
  name: string;
  slug: string;
  kind: "candidate" | "election";
  parent_id: string;
  queries: string;
  context: string;
  x_handle: string;
  active: boolean;
  line_to: string;
  email_to: string;
};

const emptyDraft: Draft = {
  name: "",
  slug: "",
  kind: "candidate",
  parent_id: "",
  queries: "",
  context: "",
  x_handle: "",
  active: true,
  line_to: "",
  email_to: "",
};

const toDraft = (t: WatchTarget): Draft => ({
  id: t.id,
  name: t.name,
  slug: t.slug,
  kind: t.kind,
  parent_id: t.parent_id ?? "",
  queries: t.queries.join("\n"),
  context: t.context ?? "",
  x_handle: t.x_handle ?? "",
  active: t.active,
  line_to: t.line_to ?? "",
  email_to: t.email_to ?? "",
});

const inputClass = "border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm";

interface TestTweet {
  id: string;
  text: string;
  created_at: string;
  url: string;
  likes: number;
  retweets: number;
}

export default function TargetsAdminPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<WatchTarget[]>([]);
  const [store, setStore] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ queries: string[]; mock?: boolean; tweets?: TestTweet[]; error?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/targets", { cache: "no-store" });
    const data = await res.json();
    setTargets(data.targets ?? []);
    setStore(data.store ?? "");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const elections = targets.filter((t) => t.kind === "election" && t.id !== draft.id);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const call = async (url: string, method: string, body?: object) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "失敗しました");
      return data;
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const payload = () => ({
    name: draft.name,
    slug: draft.slug,
    kind: draft.kind,
    parent_id: draft.kind === "candidate" ? draft.parent_id || null : null,
    queries: draft.queries.split("\n"),
    context: draft.context,
    x_handle: draft.kind === "candidate" ? draft.x_handle : null,
    active: draft.active,
    line_to: draft.line_to,
    email_to: draft.email_to,
  });

  const save = async () => {
    const data = draft.id
      ? await call(`/api/admin/targets/${draft.id}`, "PATCH", payload())
      : await call("/api/admin/targets", "POST", payload());
    if (data) {
      setMessage({ ok: true, text: `「${data.target.name}」を保存しました` });
      setDraft(toDraft(data.target));
      load();
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    // 確認ダイアログは使わず、2回押しで削除する
    if (!busy && message?.text !== "もう一度押すと削除します（収集済み投稿は残ります）") {
      setMessage({ ok: false, text: "もう一度押すと削除します（収集済み投稿は残ります）" });
      return;
    }
    if (await call(`/api/admin/targets/${draft.id}`, "DELETE")) {
      setDraft(emptyDraft);
      setMessage({ ok: true, text: "削除しました" });
      load();
    }
  };

  const testSearch = async () => {
    setTest(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/targets/test-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: draft.queries.split("\n") }),
      });
      setTest(await res.json());
    } finally {
      setBusy(false);
    }
  };

  const testAlert = async () => {
    const data = await call("/api/admin/monitor/test-alert", "POST", { targetId: draft.id });
    if (data) {
      setMessage({
        ok: data.results.every((r: { ok: boolean }) => r.ok),
        text: data.results.map((r: { channel: string; ok: boolean; error?: string }) => `${r.channel}: ${r.ok ? "送信OK" : r.error}`).join(" ／ "),
      });
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">監視対象の管理</h1>
            <p className="text-muted-foreground text-sm">
              候補者・選挙の登録と検索語の設定
              {store === "file" && <span className="ml-2 text-amber-400">（ローカルモックDB: data/monitor-db.json）</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/monitor")}>監視ダッシュボード</Button>
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin")}>管理パネルへ</Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <aside className="space-y-2">
            <Button size="sm" className="w-full" onClick={() => { setDraft(emptyDraft); setTest(null); setMessage(null); }}>
              ＋ 新規登録
            </Button>
            <ul className="space-y-1">
              {targets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => { setDraft(toDraft(t)); setTest(null); setMessage(null); }}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-zinc-800 ${draft.id === t.id ? "bg-zinc-800" : ""}`}
                  >
                    <span className={t.parent_id ? "pl-3" : ""}>
                      {t.kind === "election" ? "🗳 " : ""}
                      {t.name}
                    </span>
                    {!t.active && <span className="ml-1 text-xs text-zinc-500">停止中</span>}
                    <span className="block text-xs text-zinc-500">
                      {t.queries.length}語
                      {t.last_collected_at && ` ・最終収集 ${new Date(t.last_collected_at).toLocaleString("ja-JP")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="space-y-4 rounded-lg border border-zinc-800 p-4">
            <h2 className="text-base font-medium">{draft.id ? `編集: ${draft.name}` : "新規登録"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                表示名
                <input className={inputClass} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="東国原英夫" />
              </label>
              <label className="text-sm">
                slug（URL用・半角英小文字）
                <input className={inputClass} value={draft.slug} onChange={(e) => set("slug", e.target.value)} placeholder="higashikokubaru" />
              </label>
              <label className="text-sm">
                種別
                <select className={inputClass} value={draft.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
                  <option value="candidate">候補者（candidate）</option>
                  <option value="election">選挙（election）</option>
                </select>
              </label>
              {draft.kind === "candidate" && (
                <label className="text-sm">
                  所属する選挙
                  <select className={inputClass} value={draft.parent_id} onChange={(e) => set("parent_id", e.target.value)}>
                    <option value="">（なし: 単独で検索）</option>
                    {elections.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </label>
              )}
            </div>

            <label className="block text-sm">
              {draft.kind === "election" ? "選挙名の検索語（1行1語）" : "候補者名・表記ゆれ・陣営ワード（1行1語）"}
              <textarea
                className={`${inputClass} h-32 font-mono`}
                value={draft.queries}
                onChange={(e) => set("queries", e.target.value)}
                placeholder={draft.kind === "election" ? "宮崎県知事選\n宮崎知事選" : "東国原英夫\n東国原\nそのまんま東"}
              />
              <span className="text-xs text-zinc-500">
                {draft.kind === "candidate" && draft.parent_id
                  ? "選挙の検索語とまとめて1クエリで検索し、本文にこれらの語を含む投稿をこの候補者に振り分けます。"
                  : "これらの語を OR で結合して検索します（リツイート除外・日本語のみ）。"}
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={testSearch} disabled={busy}>テスト検索（直近20件）</Button>
            </div>
            {test && (
              <div className="rounded-md border border-zinc-800 p-3 text-sm">
                <p className="font-mono text-xs text-zinc-400">{test.queries?.join("  |  ")}</p>
                {test.mock && <p className="mt-1 text-xs text-amber-400">X_SOURCE=mock のためダミー結果です</p>}
                {test.error && <p className="mt-1 text-xs text-red-400">{test.error}</p>}
                <ul className="mt-2 max-h-80 divide-y divide-zinc-800 overflow-y-auto">
                  {test.tweets?.map((t) => (
                    <li key={t.id} className="py-1.5">
                      <span className="text-xs text-zinc-500">{new Date(t.created_at).toLocaleString("ja-JP")} ・RT {t.retweets}</span>
                      <p className="text-zinc-200">{t.text}</p>
                    </li>
                  ))}
                  {test.tweets?.length === 0 && <li className="py-2 text-zinc-500">該当なし</li>}
                </ul>
              </div>
            )}

            {draft.kind === "candidate" && (
              <label className="block text-sm">
                本人の X アカウント（任意）
                <input
                  className={inputClass}
                  value={draft.x_handle}
                  onChange={(e) => set("x_handle", e.target.value)}
                  placeholder="@higashi_kokuba"
                />
                <span className="text-xs text-zinc-500">入れると、本人の投稿（表示回数・いいね）と、それへのリプライ（好意的・批判・要チェックの判定）も集めます。</span>
              </label>
            )}

            <label className="block text-sm">
              事実メモ（分類時に Claude に渡す。経歴・在任期間・公表済みの事実など）
              <textarea className={`${inputClass} h-24`} value={draft.context} onChange={(e) => set("context", e.target.value)} />
              <span className="text-xs text-zinc-500">「要チェック」（事実と異なる断定）の判定基準になります。出典の確かな事実だけを書いてください。</span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                LINE 通知先（userId / groupId）
                <input className={inputClass} value={draft.line_to} onChange={(e) => set("line_to", e.target.value)} placeholder="空欄なら ALERT_LINE_TO" />
              </label>
              <label className="text-sm">
                メール通知先（カンマ区切り）
                <input className={inputClass} value={draft.email_to} onChange={(e) => set("email_to", e.target.value)} placeholder="空欄なら ALERT_EMAIL_TO" />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
              収集を有効にする
            </label>

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
              <Button size="sm" onClick={save} disabled={busy}>保存</Button>
              {draft.id && (
                <>
                  <Button size="sm" variant="outline" onClick={testAlert} disabled={busy}>通知テスト</Button>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={remove} disabled={busy}>削除</Button>
                </>
              )}
              {message && <span className={`text-sm ${message.ok ? "text-emerald-400" : "text-red-400"}`}>{message.text}</span>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
