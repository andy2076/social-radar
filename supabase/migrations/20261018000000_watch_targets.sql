-- 候補者監視（watch_target）拡張
-- 既存の地域分析は JSON ファイル運用のまま。posts.target_id = null の行は地域収集分として扱う。

create extension if not exists pgcrypto;

-- 監視対象 -----------------------------------------------------------------
create table watch_targets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  kind text not null check (kind in ('candidate', 'election')),
  -- candidate を election の下にぶら下げると、選挙単位で1クエリにまとめて収集し候補者へ振り分ける
  parent_id uuid references watch_targets(id) on delete set null,
  -- election: 選挙名（例: 宮崎県知事選）／ candidate: 候補者名・表記ゆれ・陣営ワード
  queries text[] not null default '{}',
  -- 分類プロンプトに渡す事実メモ（経歴・在任期間など）。risk=high 判定の基準になる
  context text,
  -- 候補者本人の X アカウント（@ なし）。本人の投稿とそれへのリプライを収集する
  x_handle text,
  active boolean not null default true,
  -- 通知先（空なら環境変数 ALERT_LINE_TO / ALERT_EMAIL_TO にフォールバック）
  line_to text,
  email_to text,
  -- 収集カーソル（X API since_id）
  since_id text,
  last_collected_at timestamptz,
  created_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

-- 投稿 ---------------------------------------------------------------------
create table posts (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,          -- X の tweet id
  target_id uuid references watch_targets(id) on delete set null,  -- 主たる監視対象（地域収集分は null）
  source text not null default 'x_api',      -- x_api | mock | scraped
  content text not null,
  posted_at timestamptz not null,
  author_id text,                            -- 数値IDのみ。プロフィール情報は保存しない
  -- mention: 検索で拾った言及 / own: 候補者本人の投稿（分類しない）/ reply: 本人の投稿へのリプライ
  post_kind text not null default 'mention' check (post_kind in ('mention', 'own', 'reply')),
  reply_to text,                             -- reply の返信先（本人の投稿の external_id）
  url text,
  likes integer not null default 0,
  retweets integer not null default 0,
  replies integer not null default 0,
  impressions integer not null default 0,
  collected_at timestamptz not null default now(),
  -- 自動分類は1投稿1回: claim → classified_at をセット。エラー時は classify_error に残し自動リトライしない
  classify_claimed_at timestamptz,
  classified_at timestamptz,
  classify_error text
);
create index posts_target_posted_idx on posts (target_id, posted_at desc);
create index posts_unclassified_idx on posts (collected_at) where classified_at is null and classify_error is null;

-- 1投稿が複数候補に言及する場合の紐付け（比較ビュー・集計はこちらを使う）
create table post_targets (
  post_id uuid not null references posts(id) on delete cascade,
  target_id uuid not null references watch_targets(id) on delete cascade,
  primary key (post_id, target_id)
);
create index post_targets_target_idx on post_targets (target_id);

-- 分類結果 -------------------------------------------------------------------
-- 追記のみ。source=model が Claude の判定（original）、source=human が人の修正（corrected）
create table post_assessments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  stance text not null check (stance in ('supportive', 'neutral', 'critical', 'hostile')),
  risk text not null check (risk in ('none', 'low', 'high')),
  risk_reason text,
  topic text,
  model text not null,                       -- Claude のモデルID、人手修正なら 'human'
  source text not null default 'model' check (source in ('model', 'human')),
  corrects_id uuid references post_assessments(id) on delete set null,
  corrected_by text,
  created_at timestamptz not null default now()
);
create index post_assessments_post_idx on post_assessments (post_id, created_at desc);

-- 通知 ---------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references watch_targets(id) on delete set null,
  post_id uuid not null references posts(id) on delete cascade,
  level text not null default 'high' check (level in ('high')),
  channel text not null check (channel in ('line', 'email')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (post_id, channel)                  -- 同一投稿の重複通知を抑止
);

-- 有効な分類（人手修正 > 最新のモデル判定）と、最初のモデル判定（original）
create view post_assessment_current with (security_invoker = true) as
select distinct on (post_id) *
from post_assessments
order by post_id, (source = 'human') desc, created_at desc;

create view post_assessment_original with (security_invoker = true) as
select distinct on (post_id) *
from post_assessments
where source = 'model'
order by post_id, created_at asc;

-- ダッシュボード用: 監視対象ごとの投稿＋分類
create view monitor_post_view with (security_invoker = true) as
select
  pt.target_id,
  p.id, p.external_id, p.target_id as primary_target_id, p.source, p.content, p.posted_at,
  p.author_id, p.post_kind, p.reply_to, p.url, p.likes, p.retweets, p.replies, p.impressions,
  p.classified_at, p.classify_error,
  c.id as assessment_id, c.stance, c.risk, c.risk_reason, c.topic, c.model, c.source as assessment_source,
  o.stance as original_stance, o.risk as original_risk, o.topic as original_topic
from post_targets pt
join posts p on p.id = pt.post_id
left join post_assessment_current c on c.post_id = p.id
left join post_assessment_original o on o.post_id = p.id;

-- 未分類投稿を原子的に確保する（並行する cron 実行で二重に Claude を呼ばない）
create or replace function claim_unclassified_posts(p_limit int, p_stale_minutes int default 30)
returns setof posts
language sql
as $$
  update posts set classify_claimed_at = now()
  where id in (
    select id from posts
    where classified_at is null
      and classify_error is null
      and target_id is not null
      and post_kind <> 'own'
      and (classify_claimed_at is null or classify_claimed_at < now() - make_interval(mins => p_stale_minutes))
    order by collected_at
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

-- service role 経由でのみアクセスする（anon には公開しない）
alter table watch_targets enable row level security;
alter table posts enable row level security;
alter table post_targets enable row level security;
alter table post_assessments enable row level security;
alter table alerts enable row level security;

-- 「新しい表を自動で公開」を切ったプロジェクトでも、サーバー（service_role）だけは読み書きできるようにする
grant usage on schema public to service_role;
grant all on watch_targets, posts, post_targets, post_assessments, alerts to service_role;
grant select on post_assessment_current, post_assessment_original, monitor_post_view to service_role;
grant execute on function claim_unclassified_posts(int, int) to service_role;
