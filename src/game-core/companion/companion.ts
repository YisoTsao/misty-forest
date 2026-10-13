// 星光夥伴（規格 5.2、Phase 3）：跟隨玩家，依目前的進度給提示。提示是資料（條件 → 文字 key），第一個符合者勝出。
import { z } from 'zod';
import type { GameState } from '../authority/rules';
import { conditionSchema, evaluateCondition, type ConditionContext } from '../dialogue/conditions';

export const companionDefSchema = z.object({
  nameKey: z.string().min(1),
  hints: z.array(z.object({ when: conditionSchema.optional(), textKey: z.string().min(1) })).min(1),
});
export type CompanionDef = z.infer<typeof companionDefSchema>;

export function parseCompanion(raw: unknown): CompanionDef {
  const def = companionDefSchema.parse(raw);
  if (def.hints[def.hints.length - 1]?.when) throw new Error('星光夥伴的最後一個提示必須沒有條件（預設提示）');
  return def;
}

export function pickCompanionHint(def: CompanionDef, state: GameState, ctx: ConditionContext): string {
  return def.hints.find((h) => evaluateCondition(h.when, state, ctx))?.textKey ?? def.hints[def.hints.length - 1]!.textKey;
}
