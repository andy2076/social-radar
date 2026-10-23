import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "playwright-core"],
  // data/ には X ログイン用の Chrome プロファイル（数百MB）があるため、ビルド時の依存ファイル追跡から外す
  outputFileTracingExcludes: {
    "*": ["data/chrome-profile/**", "data/monitor-db.json"],
  },
};

export default nextConfig;
