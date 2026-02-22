import { promises as fs } from "fs";
import path from "path";
import { Post } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const SCRAPED_FILE = path.join(DATA_DIR, "scraped-posts.json");

interface StoredData {
  posts: Post[];
  lastScrapedAt: string;
  keywords?: string[];
}

export async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

export async function loadScrapedPosts(): Promise<StoredData> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(SCRAPED_FILE, "utf-8");
    return JSON.parse(raw) as StoredData;
  } catch {
    return { posts: [], lastScrapedAt: "" };
  }
}

export async function saveScrapedPosts(newPosts: Post[], keywords?: string[]): Promise<StoredData> {
  await ensureDataDir();

  const existing = await loadScrapedPosts();

  // Deduplicate by id
  const existingIds = new Set(existing.posts.map((p) => p.id));
  const uniqueNew = newPosts.filter((p) => !existingIds.has(p.id));

  const merged: StoredData = {
    posts: [...existing.posts, ...uniqueNew].sort((a, b) =>
      b.date.localeCompare(a.date)
    ),
    lastScrapedAt: new Date().toISOString(),
    keywords: keywords || existing.keywords,
  };

  await fs.writeFile(SCRAPED_FILE, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
