"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardData } from "@/contexts/data-context";

const PAGE_SIZE = 20;

export function PostsTable() {
  const { filteredPosts } = useDashboardData();
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<"date" | "likes">("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...filteredPosts];
    arr.sort((a, b) => {
      const cmp =
        sortField === "date"
          ? a.date.localeCompare(b.date)
          : a.likes - b.likes;
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [filteredPosts, sortField, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: "date" | "likes") => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
    setPage(0);
  };

  const sortIndicator = (field: string) => {
    if (sortField !== field) return "";
    return sortAsc ? " \u25B2" : " \u25BC";
  };

  // Reset page when filtered data changes
  useMemo(() => {
    setPage(0);
  }, [filteredPosts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">投稿一覧</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th
                  className="cursor-pointer px-3 py-2 font-medium"
                  onClick={() => handleSort("date")}
                >
                  日付{sortIndicator("date")}
                </th>
                <th className="px-3 py-2 font-medium">アカウント</th>
                <th className="px-3 py-2 font-medium">トピック</th>
                <th className="px-3 py-2 font-medium">内容</th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium"
                  onClick={() => handleSort("likes")}
                >
                  いいね{sortIndicator("likes")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((post) => (
                <tr
                  key={post.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                    {post.date}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {post.accountName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
                      {post.topic}
                    </span>
                  </td>
                  <td className="max-w-[200px] px-3 py-2 text-zinc-300 sm:max-w-md">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{post.content}</span>
                      {post.url && (
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-zinc-500 hover:text-zinc-300"
                          title="元の投稿を開く"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-3.5 w-3.5"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </a>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-400">
                    {post.likes.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {sorted.length}件中 {page * PAGE_SIZE + 1}〜
              {Math.min((page + 1) * PAGE_SIZE, sorted.length)}件
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                前へ
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
              >
                次へ
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
