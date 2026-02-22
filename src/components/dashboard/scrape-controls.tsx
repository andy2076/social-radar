"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardData } from "@/contexts/data-context";

type Status = "idle" | "loading" | "success" | "error";

const KEYWORDS_STORAGE_KEY = "x-scraper-keywords";
const SINCE_STORAGE_KEY = "x-scraper-since";
const UNTIL_STORAGE_KEY = "x-scraper-until";
const DEFAULT_KEYWORDS = "都城市\n都城\nmiyakonojo";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

export function ScrapeControls() {
  const { loadScrapedData, lastScrapedAt } = useDashboardData();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [since, setSince] = useState(weekAgoStr());
  const [until, setUntil] = useState(todayStr());
  const [showSettings, setShowSettings] = useState(false);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scrape?action=session-status");
      const data = await res.json();
      setHasSession(data.hasSession);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkSession();
    const savedKw = localStorage.getItem(KEYWORDS_STORAGE_KEY);
    if (savedKw) setKeywords(savedKw);
    const savedSince = localStorage.getItem(SINCE_STORAGE_KEY);
    if (savedSince) setSince(savedSince);
    const savedUntil = localStorage.getItem(UNTIL_STORAGE_KEY);
    if (savedUntil) setUntil(savedUntil);
  }, [checkSession]);

  const saveKeywords = (value: string) => {
    setKeywords(value);
    localStorage.setItem(KEYWORDS_STORAGE_KEY, value);
  };

  const saveSince = (value: string) => {
    setSince(value);
    localStorage.setItem(SINCE_STORAGE_KEY, value);
  };

  const saveUntil = (value: string) => {
    setUntil(value);
    localStorage.setItem(UNTIL_STORAGE_KEY, value);
  };

  const getKeywordList = () =>
    keywords
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

  const handleLogin = async () => {
    setStatus("loading");
    setMessage("ブラウザが開きます。Xにログインしてください...");

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login" }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus("success");
        setMessage(data.message);
        setHasSession(true);
      } else {
        setStatus("error");
        setMessage(data.message || "ログインに失敗しました");
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "エラーが発生しました"
      );
    }
  };

  const handleScrape = async () => {
    const kwList = getKeywordList();
    if (kwList.length === 0) {
      setStatus("error");
      setMessage("検索キーワードを1つ以上入力してください");
      return;
    }

    setStatus("loading");
    const days = since && until
      ? Math.ceil((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1
      : 0;
    const estimate = days > 0
      ? `${kwList.length}キーワード x ${days}日 = ${kwList.length * days}回検索、${Math.ceil(kwList.length * days * 0.5)}分程度`
      : `${kwList.length}キーワード、1〜2分`;
    setMessage(`X検索を実行中...（${estimate}）`);

    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scrape",
          keywords: kwList,
          since: since || undefined,
          until: until || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "スクレイピングに失敗しました");
      }

      setStatus("success");
      setMessage(
        `${data.newCount}件の新規投稿を取得（合計${data.totalCount}件）`
      );
      loadScrapedData();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "エラーが発生しました"
      );
    }
  };

  const handleLoadExisting = async () => {
    try {
      loadScrapedData();
      setMessage("保存済みデータを読み込みました");
      setStatus("success");
    } catch {
      setMessage("保存済みデータの読み込みに失敗");
      setStatus("error");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">X自動収集</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleLogin}
            disabled={status === "loading"}
          >
            {hasSession ? "Xに再ログイン" : "Xにログイン"}
          </Button>
          <Button
            size="sm"
            onClick={handleScrape}
            disabled={status === "loading" || !hasSession}
          >
            {status === "loading" ? "実行中..." : "X検索を実行"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleLoadExisting}>
            保存済みデータを読込
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? "設定を閉じる" : "検索設定"}
          </Button>
        </div>

        {showSettings && (
          <div className="space-y-3 rounded-md border border-zinc-800 p-3">
            <div>
              <label className="text-sm font-medium">検索キーワード</label>
              <p className="text-muted-foreground text-xs">
                1行に1キーワード。各キーワードでXを検索します。
              </p>
              <textarea
                className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
                rows={5}
                value={keywords}
                onChange={(e) => saveKeywords(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                現在 {getKeywordList().length} キーワード設定中
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">検索期間</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                  value={since}
                  onChange={(e) => saveSince(e.target.value)}
                />
                <span className="text-muted-foreground text-sm">〜</span>
                <input
                  type="date"
                  className="border-input bg-background rounded-md border px-3 py-1.5 text-sm"
                  value={until}
                  onChange={(e) => saveUntil(e.target.value)}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                空欄にすると期間指定なし（Xの最新結果を取得）。
                Xの仕様上、古い投稿は取得できない場合があります。
              </p>
            </div>
          </div>
        )}

        {!hasSession && status !== "loading" && (
          <p className="text-xs text-yellow-400">
            まず「Xにログイン」でブラウザからログインしてください
          </p>
        )}
        {hasSession && status === "idle" && (
          <p className="text-xs text-green-400">セッション取得済み</p>
        )}

        {message && (
          <p
            className={`text-sm ${
              status === "error"
                ? "text-red-400"
                : status === "success"
                  ? "text-green-400"
                  : "text-zinc-400"
            }`}
          >
            {message}
          </p>
        )}
        {lastScrapedAt && (
          <p className="text-muted-foreground text-xs">
            前回の収集:{" "}
            {new Date(lastScrapedAt).toLocaleString("ja-JP")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
