"use client";

import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from "react";
import { Post, DataSource } from "@/lib/types";
import {
  calculateStats,
  getDailyCounts,
  getTopicDailyCounts,
  getTopicInfos,
} from "@/lib/data-transforms";

interface DateRange {
  since: string;
  until: string;
}

interface DataContextValue {
  posts: Post[];
  filteredPosts: Post[];
  isLoading: boolean;
  dataSource: DataSource;
  lastScrapedAt: string | null;
  stats: ReturnType<typeof calculateStats>;
  dailyCounts: ReturnType<typeof getDailyCounts>;
  topicDailyCounts: ReturnType<typeof getTopicDailyCounts>;
  topicInfos: ReturnType<typeof getTopicInfos>;
  allTopicInfos: ReturnType<typeof getTopicInfos>;
  selectedTopics: Set<string>;
  setSelectedTopics: (topics: Set<string>) => void;
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
  keywords: string[];
  setPosts: (posts: Post[]) => void;
  loadScrapedData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPostsState] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>("scraped");
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);

  // All topic infos (unfiltered) - used for topic filter UI
  const allTopicInfos = useMemo(() => getTopicInfos(posts), [posts]);

  // Initialize selectedTopics when posts change
  useMemo(() => {
    const topics = allTopicInfos.map((t) => t.name);
    setSelectedTopics(new Set(topics));
  }, [allTopicInfos]);

  // Filter posts by selected topics and date range
  const filteredPosts = useMemo(() => {
    let result = posts;

    if (selectedTopics.size > 0) {
      result = result.filter((p) => selectedTopics.has(p.topic));
    }

    if (dateRange) {
      if (dateRange.since) {
        result = result.filter((p) => p.date >= dateRange.since);
      }
      if (dateRange.until) {
        result = result.filter((p) => p.date <= dateRange.until);
      }
    }

    return result;
  }, [posts, selectedTopics, dateRange]);

  // All computed values based on filteredPosts
  const stats = useMemo(() => calculateStats(filteredPosts), [filteredPosts]);
  const dailyCounts = useMemo(() => getDailyCounts(filteredPosts), [filteredPosts]);
  const topicDailyCounts = useMemo(() => getTopicDailyCounts(filteredPosts), [filteredPosts]);
  const topicInfos = useMemo(() => getTopicInfos(filteredPosts), [filteredPosts]);

  const setPosts = (newPosts: Post[]) => {
    setPostsState(newPosts);
    setDataSource("csv");
    setDateRange(null);
  };

  const loadScrapedData = useCallback(async () => {
    try {
      const res = await fetch("/api/posts");
      const data = await res.json();

      if (data.posts && data.posts.length > 0) {
        setPostsState(data.posts);
        setDataSource("scraped");
        setLastScrapedAt(data.lastScrapedAt || null);
        setKeywords(data.keywords || []);
        setDateRange(null);
      }
    } catch {
      // Failed to load scraped data
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初回マウント時に蓄積データを自動ロード
  useEffect(() => {
    loadScrapedData();
  }, [loadScrapedData]);

  return (
    <DataContext.Provider
      value={{
        posts,
        filteredPosts,
        isLoading,
        dataSource,
        lastScrapedAt,
        stats,
        dailyCounts,
        topicDailyCounts,
        topicInfos,
        allTopicInfos,
        selectedTopics,
        setSelectedTopics,
        dateRange,
        setDateRange,
        keywords,
        setPosts,
        loadScrapedData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDashboardData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useDashboardData must be used within a DataProvider");
  }
  return context;
}
