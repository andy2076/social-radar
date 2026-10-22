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

## 候補者SNS監視（watch_target）

既存の地域分析の上に「監視対象（watch_target）」を重ねた拡張。地域分析（`/`・JSON運用）はそのまま動く。

- **監視ダッシュボード** `/monitor`（ログイン必須）: 監視対象セレクタ、risk=high 一覧（最上部・赤）、日別×stance 積み上げ、topic 拡散推移（初出から1h/6h/24h）、stance/risk/topic 列とフィルタ付き投稿一覧、分類の人手修正・手動再分類
- **候補者比較** `/monitor/compare`: 複数候補者を横並び表示
- **監視対象の管理** `/admin/targets`: CRUD、検索語の編集、保存前のテスト検索（直近20件）、通知テスト

### 構成

```
手元のPCで /monitor の「今すぐ収集・分類」→ runCycle()
  1. 収集: election 単位で「選挙名＋配下候補者の語」を1クエリにまとめ、ログイン済みブラウザで X の「最新」検索を読む
           → 本文照合で候補者へ振り分け（posts.target_id / post_targets）
     候補者に本人の X アカウント（x_handle）があれば、直近48時間の本人投稿（post_kind=own）と
     そのリプライ（post_kind=reply, reply_to=本人投稿の id）も集める。本人投稿は分類しない
  2. 分類: 未分類投稿を claim → Claude API（既定 claude-haiku-5-5）を1投稿1回 → post_assessments（source=model）
  3. 通知: risk=high → LINE push / メール（alerts の (post_id, channel) 一意制約で重複抑止）
```

- DB: Supabase（`supabase/migrations/20261018000000_watch_targets.sql`）。未設定時は `data/monitor-db.json` のローカルモックDB
- 収集: 地域分析と同じ Playwright のプロファイル（`data/chrome-profile`）を使う。X が headless を 403 で拒否するため Chrome のウィンドウが開く。Vercel 上では動かない
  - `X_BEARER_TOKEN` を設定すると X API（有料）に切り替わる。`X_SOURCE=mock` でダミー投稿
- 費用: 収集は無料、分類は Haiku で1件1円未満。`/api/cron/monitor`（CRON_SECRET 認証）は残しているが、Vercel Cron は設定していない
- 人手修正は追記（source=human）で、モデルの元判定は残る。手動再分類のみ Claude を再度呼ぶ
- プロフィール情報は取得しない（投稿者の表示名・ハンドルは読まない。X API 使用時も author_id のみ）

### セットアップ

1. Supabase プロジェクトを作成し、マイグレーションSQLを SQL Editor で実行
2. `.env.example` を参考に `.env.local`（ローカル）と Vercel の環境変数を設定
3. 管理画面の「Xにログイン」で収集用アカウントにログイン（凍結リスクがあるため捨てアカウント推奨）
4. `/admin/targets` で選挙（例: 2026宮崎県知事選）→ 候補者（parent に選挙を指定）の順に登録
5. 「テスト検索」で検索語を確認 → 保存 → `/monitor` の「今すぐ収集・分類」で一巡

ローカルで Claude を呼ばずに画面を確認したい場合は `MOCK_CLASSIFIER=1`（ローカルモックDB使用時のみ有効）。

## 開発履歴

- **v1**: 基本ダッシュボード構築（モックデータ、チャート、テーブル）
- **v2**: X自動収集機能追加（Playwright、トピック分類、データ永続化）
- **v3**: 公開版リリース
  - 閲覧/管理ページ分離（パスワード認証、middleware）
  - トピックフィルター、日付範囲フィルター
  - 元ツイートリンク
  - Vercelデプロイ対応（静的JSON配信、Playwright分離）
- **v4**: 候補者SNS監視（watch_target、Claude分類、LINE/メール通知、比較ビュー）
