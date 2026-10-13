// 對話與任務共用的條件（規格 6.4：節點式資料含條件）。純函式，依權威狀態判斷。
import { z } from 'zod';
import type { GameState } from '../authority/rules';
import { hasItems } from '../inventory/inventory';
import { mistStages } from '../world/mist';
import { regionIds } from '../world/types';

const itemStack = z.object({ itemId: z.string().min(1), count: z.number().int().positive() });

export type Condition =
  | { type: 'hasItems'; items: { itemId: string; count: number }[] }
  | { type: 'mistStage'; region: (typeof regionIds)[number]; is: (typeof mistStages)[number] }
  | { type: 'tutorialDone' }
  | { type: 'not'; condition: Condition }
  | { type: 'all'; conditions: Condition[] };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('hasItems'), items: z.array(itemStack).min(1) }),
    z.object({ type: z.literal('mistStage'), region: z.enum(regionIds), is: z.enum(mistStages) }),
    z.object({ type: z.literal('tutorialDone') }),
    z.object({ type: z.literal('not'), condition: conditionSchema }),
    z.object({ type: z.literal('all'), conditions: z.array(conditionSchema).min(1) }),
  ]),
);

export function evaluateCondition(condition: Condition | undefined, state: GameState): boolean {
  if (!condition) return true;
  switch (condition.type) {
    case 'hasItems':
      return hasItems(state.inventory, condition.items);
    case 'mistStage':
      return state.mist[condition.region] === condition.is;
    case 'tutorialDone':
      return state.tutorial === 'done';
    case 'not':
      return !evaluateCondition(condition.condition, state);
    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, state));
  }
}

/** 條件中參照的物品 id（資料驗證用） */
export function conditionItemIds(condition: Condition | undefined): string[] {
  if (!condition) return [];
  switch (condition.type) {
    case 'hasItems':
      return condition.items.map((i) => i.itemId);
    case 'not':
      return conditionItemIds(condition.condition);
    case 'all':
      return condition.conditions.flatMap(conditionItemIds);
    default:
      return [];
  }
}
