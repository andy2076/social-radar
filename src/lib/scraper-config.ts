export const SCRAPER_CONFIG = {
  baseKeywords: ["都城市", "都城", "miyakonojo"],
  topicKeywords: [
    "事故",
    "火事",
    "災害",
    "イベント",
    "祭り",
    "開店",
    "閉店",
    "オープン",
    "交通",
    "渋滞",
    "市政",
    "議会",
    "農業",
    "畜産",
    "宮崎牛",
    "観光",
    "教育",
    "学校",
    "医療",
    "福祉",
    "ボランティア",
  ],
  maxResults: 100,
  scrollAttempts: 15,
  scrollDelayMs: 1500,
  requestTimeoutMs: 30000,
};

export function buildSearchQueries(): string[] {
  return SCRAPER_CONFIG.baseKeywords.map(
    (kw) =>
      `https://x.com/search?q=${encodeURIComponent(kw)}&src=typed_query&f=live`
  );
}
