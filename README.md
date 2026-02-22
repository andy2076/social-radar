# Social Radar

都城市を中心とした近隣圏域に関するX（旧Twitter）の投稿を自動収集し、トピック別に分類・可視化する地域分析ダッシュボード。

**本番URL**: https://social-radar-puce.vercel.app

## 機能

### 公開ダッシュボード (`/`)
- 収集キーワード表示
- トピック別フィルター（複数選択、全選択/全解除）
- 日付範囲フィルター
- 統計カード（ユニークアカウント数、投稿数、データソース、最終取得日時）
- 日別投稿数チャート
- トピック別積み上げチャート
- 投稿一覧テーブル（ソート、ページネーション、元ツイートリンク）

### 管理パネル (`/admin`)
- パスワード認証で保護
- Xログイン（Playwright経由でブラウザ起動）
- スクレイプ実行（キーワード・期間設定）
- CSVインポート
- 保存済みデータ読み込み

## 技術スタック

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **Recharts** - チャート描画
- **Radix UI** - UIプリミティブ
- **Playwright** - X(Twitter)スクレイピング（ローカルのみ）
- **PapaParse** - CSV解析

## アーキテクチャ

```
公開ページ (/)          管理ページ (/admin)
  ↓                       ↓
/scraped-posts.json    /api/admin/scrape (認証必須)
(静的JSON)              /api/admin/auth
                          ↓
                       Playwright (ローカルのみ)
                          ↓
                       data/scraped-posts.json
                          ↓
                       public/scraped-posts.json にコピー → git push → Vercel自動デプロイ
```

- **公開ページ**: `public/scraped-posts.json` を静的ファイルとして読み込み
- **管理ページ**: ローカル環境でPlaywrightを使ってXをスクレイプ
- **デプロイ**: Vercel（Playwrightは動作しないため、収集はローカルで実行）

## セットアップ

```bash
npm install
npm run dev
```

http://localhost:3000 でダッシュボード、http://localhost:3000/admin で管理パネル。

### 環境変数

`.env.local` に設定：

```
ADMIN_PASSWORD=your-password-here
```

## データ収集の流れ

1. `/admin` にログイン
2. 「Xにログイン」でブラウザが開き、Xにログイン（初回のみ）
3. キーワード・期間を設定して「X検索を実行」
4. 収集データが `data/scraped-posts.json` に保存される
5. `public/scraped-posts.json` にコピー
6. `git commit` & `git push` → Vercelに自動デプロイ

## トピック自動分類

収集した投稿はキーワードベースで以下のトピックに自動分類：

事故・災害 / イベント・祭り / 開店・閉店 / グルメ・飲食 / 交通情報 / スポーツ・運動 / 行政・市政 / 国政・政治 / 選挙 / 農業・畜産 / 観光・おでかけ / 教育 / 医療・福祉 / 地域活動 / その他

## 開発履歴

- **v1**: 基本ダッシュボード構築（モックデータ、チャート、テーブル）
- **v2**: X自動収集機能追加（Playwright、トピック分類、データ永続化）
- **v3**: 公開版リリース
  - 閲覧/管理ページ分離（パスワード認証、middleware）
  - トピックフィルター、日付範囲フィルター
  - 元ツイートリンク
  - Vercelデプロイ対応（静的JSON配信、Playwright分離）
