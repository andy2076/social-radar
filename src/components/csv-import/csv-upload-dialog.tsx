"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseCSV } from "@/lib/csv-parser";
import { useDashboardData } from "@/contexts/data-context";

interface CsvUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CsvUploadDialog({ open, onOpenChange }: CsvUploadDialogProps) {
  const { setPosts } = useDashboardData();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setErrors([]);

    try {
      const result = await parseCSV(file);

      if (result.errors.length > 0 && result.posts.length === 0) {
        setErrors(result.errors);
      } else {
        if (result.errors.length > 0) {
          setErrors([
            ...result.errors,
            `${result.posts.length}件のデータを正常に読み込みました`,
          ]);
        }
        setPosts(result.posts);
        if (result.errors.length === 0) {
          onOpenChange(false);
        }
      }
    } catch {
      setErrors(["ファイルの読み込みに失敗しました"]);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setErrors([]);
      setFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CSVファイルをインポート</DialogTitle>
          <DialogDescription>
            SNS投稿データのCSVファイルを選択してください。
            対応カラム: date(日付), account_name(アカウント名), topic(トピック),
            content(内容), likes(いいね数) 等
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:px-4 file:py-2 file:text-sm file:font-medium"
              disabled={loading}
            />
            {fileName && (
              <p className="text-muted-foreground text-sm">
                選択中: {fileName}
              </p>
            )}
          </div>

          {loading && (
            <p className="text-muted-foreground text-sm">読み込み中...</p>
          )}

          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((error, i) => (
                <p
                  key={i}
                  className={`text-sm ${
                    error.includes("正常に")
                      ? "text-green-500"
                      : "text-destructive"
                  }`}
                >
                  {error}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => handleClose(false)}>
              閉じる
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
