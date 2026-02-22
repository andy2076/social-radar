"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ScrapeControls } from "@/components/dashboard/scrape-controls";
import { CsvUploadDialog } from "@/components/csv-import/csv-upload-dialog";
import { useState } from "react";

export default function AdminPage() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  };

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Social Radar - 管理パネル
            </h1>
            <p className="text-muted-foreground text-sm">
              データ収集・インポート操作
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/")}>
              ダッシュボードを見る
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              ログアウト
            </Button>
          </div>
        </div>

        <ScrapeControls />

        <div className="rounded-lg border border-zinc-800 p-4 space-y-3">
          <h2 className="text-base font-medium">CSVインポート</h2>
          <p className="text-muted-foreground text-sm">
            CSVファイルから投稿データをインポートします。
          </p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            CSVファイルを選択
          </Button>
          <CsvUploadDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </div>
      </div>
    </main>
  );
}
