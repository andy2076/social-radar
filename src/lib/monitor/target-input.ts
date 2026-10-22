import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null));

export const TargetInputSchema = z.object({
  name: z.string().trim().min(1, "表示名は必須です"),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, "slug は半角英小文字・数字・ハイフンのみ"),
  kind: z.enum(["candidate", "election"]),
  parent_id: optionalText,
  queries: z.array(z.string().trim()).transform((qs) => qs.filter(Boolean)),
  context: optionalText,
  x_handle: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.replace(/^@/, "") : null))
    .refine((v) => v === null || /^[A-Za-z0-9_]{1,15}$/.test(v), "X の @ID は英数字と _ の15文字以内です"),
  active: z.boolean().default(true),
  line_to: optionalText,
  email_to: optionalText,
});

export const TargetPatchSchema = TargetInputSchema.partial();
