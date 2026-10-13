// 對話與任務共用的條件（規格 6.4：節點式資料含條件）。純函式，依權威狀態判斷。
import { z } from 'zod';
import type { GameState } from '../authority/rules';
import { hasItems } from '../inventory/inventory';
import { isQuestReady, questStatus, type QuestCatalog } from '../quest/quest';
import { mistStages } from '../world/mist';
import { clockAt, inTimeRange } from '../world/timeOfDay';
import { regionIds } from '../world/types';

const itemStack = z.object({ itemId: z.string().min(1), count: z.number().int().positive() });

export type Condition =
  | { type: 'hasItems'; items: { itemId: string; count: number }[] }
  | { type: 'mistStage'; region: (typeof regionIds)[number]; is: (typeof mistStages)[number] }
  | { type: 'tutorialDone' }
  | { type: 'questStatus'; quest: string; is: 'locked' | 'available' | 'active' | 'completed' }
  /** 任務進行中且目標全部達成（可以回報） */
  | { type: 'questReady'; quest: string }
  /** 在家園蓋過東西（可指定種類） */
  | { type: 'hasBuilt'; buildable?: string }
  /** 遊戲時鐘在 [from, to) 小時內；from > to 表示跨午夜（GAME_DESIGN 5.2） */
  | { type: 'timeRange'; from: number; to: number }
  | { type: 'not'; condition: Condition }
  | { type: 'all'; conditions: Condition[] };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('hasItems'), items: z.array(itemStack).min(1) }),
    z.object({ type: z.literal('mistStage'), region: z.enum(regionIds), is: z.enum(mistStages) }),
    z.object({ type: z.literal('tutorialDone') }),
    z.object({ type: z.literal('questStatus'), quest: z.string().min(1), is: z.enum(['locked', 'available', 'active', 'completed']) }),
    z.object({ type: z.literal('questReady'), quest: z.string().min(1) }),
    z.object({ type: z.literal('hasBuilt'), buildable: z.string().min(1).optional() }),
    z.object({ type: z.literal('timeRange'), from: z.number().min(0).max(24), to: z.number().min(0).max(24) }),
    z.object({ type: z.literal('not'), condition: conditionSchema }),
    z.object({ type: z.literal('all'), conditions: z.array(conditionSchema).min(1) }),
  ]),
);

/** 條件判斷需要的靜態資料 */
export type ConditionContext = { quests: QuestCatalog };

export function evaluateCondition(condition: Condition | undefined, state: GameState, ctx: ConditionContext): boolean {
  if (!condition) return true;
  const quest = (id: string) => {
    const def = ctx.quests.get(id);
    if (!def) throw new Error(`條件參照不存在的任務：${id}`);
    return def;
  };
  switch (condition.type) {
    case 'hasItems':
      return hasItems(state.inventory, condition.items);
    case 'mistStage':
      return state.mist[condition.region] === condition.is;
    case 'tutorialDone':
      return state.tutorial === 'done';
    case 'questStatus':
      return questStatus(state, quest(condition.quest)) === condition.is;
    case 'questReady':
      return isQuestReady(state, quest(condition.quest));
    case 'hasBuilt':
      return state.buildings.some((b) => condition.buildable === undefined || b.buildable === condition.buildable);
    case 'timeRange':
      return inTimeRange(clockAt(state.time), condition.from, condition.to);
    case 'not':
      return !evaluateCondition(condition.condition, state, ctx);
    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, state, ctx));
  }
}

/** 條件中參照的任務 id（資料驗證用） */
export function conditionQuestIds(condition: Condition | undefined): string[] {
  if (!condition) return [];
  switch (condition.type) {
    case 'questStatus':
    case 'questReady':
      return [condition.quest];
    case 'not':
      return conditionQuestIds(condition.condition);
    case 'all':
      return condition.conditions.flatMap(conditionQuestIds);
    default:
      return [];
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
