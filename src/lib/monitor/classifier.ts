import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MonitorPost, Risk, Stance, WatchTarget } from "./types";

export const CLASSIFY_MODEL = process.env.CLASSIFY_MODEL || "claude-haiku-5-5";
const CLASSIFY_EFFORT = (process.env.CLASSIFY_EFFORT || "medium") as "low" | "medium" | "high";

const ResultSchema = z.object({
  stance: z.enum(["supportive", "neutral", "critical", "hostile"]),
  risk: z.enum(["none", "low", "high"]),
  risk_reason: z.string(),
  topic: z.string(),
});
export type ClassifyResult = z.infer<typeof ResultSchema>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    stance: { type: "string", enum: ["supportive", "neutral", "critical", "hostile"] },
    risk: { type: "string", enum: ["none", "low", "high"] },
    risk_reason: { type: "string" },
    topic: { type: "string" },
  },
  required: ["stance", "risk", "risk_reason", "topic"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `あなたは選挙候補者の陣営が使うSNSモニタリングの分類担当です。X（旧Twitter）の公開投稿1件を読み、監視対象（候補者または選挙）に対する投稿の性質を判定します。

## stance（監視対象への態度）
- supportive: 好意的・応援・肯定的な紹介
- neutral: 事実の共有、日程告知、態度が読み取れないもの
- critical: 政策・発言・実績への批判、皮肉、懐疑。根拠のある批判も根拠の弱い批判もここ
- hostile: 人格攻撃、侮辱、強い敵意、落選運動の呼びかけ

## risk（陣営として事実確認・対応を検討すべき度合い）
- high: 次のいずれかに当たるもの
  1. 事実と異なる内容を事実として断定している
  2. 名誉毀損に当たりうる表現（具体的な事実を摘示して社会的評価を下げるもの。犯罪・不正の断定など）
  3. 本人の発言として捏造された、または出典の確認できない引用（「本人が〜と認めた」「〜と言っていた」など）
  4. 過去の経歴（知事時代の実績・辞任・口蹄疫対応・過去の不祥事など）を事実と異なる形で記述している
- low: 誤解を招く可能性はあるが断定ではないもの、真偽不明の噂話を伝聞として述べているもの、強い表現だが事実の摘示を含まない侮辱
- none: 上記に当たらないもの

重要: 皮肉・政策批判・辛辣な意見は stance=critical（または hostile）であって、それだけで risk=high にはしない。批判と危険投稿を混同しないこと。risk は「内容の事実性と名誉毀損性」で判断し、「監視対象にとって不都合かどうか」では判断しない。
事実関係の判断は、ユーザーメッセージ内の「監視対象についての事実メモ」を最優先し、メモに無い事項は一般に知られている公知の事実に照らす。真偽を判断できない場合は high にせず low とし、その旨を risk_reason に書く。

## risk_reason
risk が low / high のとき、どの基準に当たるか・どの部分が問題かを日本語1〜2文で書く。none のときは空文字。

## topic
投稿の話題を日本語の短いラベル（2〜12文字程度。例: 「農業政策」「口蹄疫対応」「出馬表明」「演説・集会」）で1つ。既存ラベルの一覧が与えられたら、意味が同じものは必ず既存ラベルをそのまま使う（同じ話題の拡散を追跡するため）。`;

export class ClassifyError extends Error {
  /** fatal: キー・設定の問題で、残りの投稿を呼んでも同じく失敗する */
  constructor(message: string, readonly retryable: boolean, readonly fatal = false) {
    super(message);
  }
}

let client: Anthropic | null = null;

export function classifierAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** 投稿1件につき Claude API を1回呼ぶ */
export async function classifyPost(
  post: Pick<MonitorPost, "content" | "posted_at">,
  targets: WatchTarget[],
  knownTopics: string[],
  /** リプライの場合、返信先の候補者本人の投稿本文 */
  replyTo: string | null = null
): Promise<ClassifyResult> {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  client ??= new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});

  const targetLines = targets
    .map((t) => {
      const kind = t.kind === "candidate" ? "候補者" : "選挙";
      const memo = t.context?.trim() ? `\n  事実メモ: ${t.context.trim()}` : "";
      return `- ${t.name}（${kind}。検索語: ${t.queries.join(" / ")}）${memo}`;
    })
    .join("\n");

  const userContent = `## 監視対象（stance は最初の対象に対する態度で判定）
${targetLines}

## 既存の topic ラベル
${knownTopics.length ? knownTopics.join("、") : "（なし）"}

${
    replyTo
      ? `## 返信先（候補者本人の投稿）
<own_post>
${replyTo}
</own_post>
次の投稿はこの本人投稿へのリプライ。stance は候補者への態度として判定する（「がんばって」等は supportive）。

`
      : ""
  }## 投稿（${post.posted_at}）
<post>
${post.content}
</post>`;

  let response;
  try {
    response = await client.beta.messages.create({
      model: CLASSIFY_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: CLASSIFY_EFFORT,
        format: { type: "json_schema", schema: JSON_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (error) {
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError ||
      error instanceof Anthropic.APIConnectionError
    ) {
      throw new ClassifyError(`一時的なエラー: ${error.message}`, true);
    }
    if (error instanceof Anthropic.APIError) {
      // 4xx は投稿内容ではなくキー・設定の問題。投稿を失敗扱いにせず次回に回す
      throw new ClassifyError(`API ${error.status}: ${error.message}`, true, true);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new ClassifyError(
      `分類を拒否されました（${response.stop_details?.category ?? "unknown"}）。手動で分類してください`,
      false
    );
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new ClassifyError(`応答にテキストがありません（stop_reason=${response.stop_reason}）`, false);
  }
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new ClassifyError(`応答がJSONではありません（stop_reason=${response.stop_reason}）`, false);
  }
  const parsed = ResultSchema.safeParse(json);
  if (!parsed.success) {
    throw new ClassifyError(`応答の形式が不正です: ${parsed.error.message}`, false);
  }
  return { ...parsed.data, topic: parsed.data.topic.trim().slice(0, 30) };
}

/**
 * 開発用のキーワード分類。MOCK_CLASSIFIER=1 かつローカルのファイルストア使用時のみ使う。
 * 本番データに混ざらないよう model='mock' で記録される。
 */
export function mockClassify(content: string): ClassifyResult {
  let stance: Stance = "neutral";
  if (/良かった|応援|期待|若い人が多/.test(content)) stance = "supportive";
  if (/わからない|物足りない|見かける/.test(content)) stance = "critical";
  if (/勘弁|振り回さない/.test(content)) stance = "hostile";
  let risk: Risk = "none";
  let reason = "";
  if (/認めていた|逃げていた/.test(content)) {
    risk = "high";
    reason = "本人発言の捏造引用と、口蹄疫対応についての事実と異なる断定を含む（モック判定）";
    stance = "hostile";
  }
  const topic = /口蹄疫/.test(content)
    ? "口蹄疫対応"
    : /演説|事務所開き/.test(content)
      ? "演説・集会"
      : /出馬/.test(content)
        ? "出馬表明"
        : /公約|子育て|農業/.test(content)
          ? "政策"
          : /討論会/.test(content)
            ? "討論会"
            : "その他";
  return { stance, risk, risk_reason: reason, topic };
}
