"use client";

import { useMemo } from "react";
import { useDashboardData } from "@/contexts/data-context";
import { Button } from "@/components/ui/button";

export function DateRangeFilter() {
  const { posts, dateRange, setDateRange } = useDashboardData();

  // Compute the full date range from all posts
  const fullRange = useMemo(() => {
    if (posts.length === 0) return { since: "", until: "" };
    const dates = posts.map((p) => p.date).sort();
    return { since: dates[0], until: dates[dates.length - 1] };
  }, [posts]);

  const since = dateRange?.since || "";
  const until = dateRange?.until || "";

  const handleSinceChange = (value: string) => {
    setDateRange({
      since: value,
      until: dateRange?.until || "",
    });
  };

  const handleUntilChange = (value: string) => {
    setDateRange({
      since: dateRange?.since || "",
      until: value,
    });
  };

  const handleReset = () => {
    setDateRange(null);
  };

  const isFiltered = dateRange !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">期間</span>
        {isFiltered && (
          <Button variant="ghost" size="xs" onClick={handleReset}>
            リセット
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="border-input bg-background rounded-md border px-2.5 py-1 text-xs"
          value={since}
          min={fullRange.since}
          max={fullRange.until}
          placeholder={fullRange.since}
          onChange={(e) => handleSinceChange(e.target.value)}
        />
        <span className="text-muted-foreground text-xs">〜</span>
        <input
          type="date"
          className="border-input bg-background rounded-md border px-2.5 py-1 text-xs"
          value={until}
          min={fullRange.since}
          max={fullRange.until}
          placeholder={fullRange.until}
          onChange={(e) => handleUntilChange(e.target.value)}
        />
      </div>
    </div>
  );
}
