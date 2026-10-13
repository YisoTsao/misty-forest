// 任務（規格 6.5）：Locked / Available / Active / Completed 狀態表。
// 權威狀態只存「已接取 / 已完成」；Locked 與 Available 由前置任務推導。進度由目前狀態計算（例如背包數量）。
import { z } from 'zod';
import { countItem } from '../inventory/inventory';
import type { ItemStack } from '../items/items';
import { mistStages } from '../world/mist';
import { regionIds } from '../world/types';

const itemStack = z.object({ itemId: z.string().min(1), count: z.number().int().positive() });

export const objectiveSchema = z.discriminatedUnion('type', [
  /** 帶著指定數量的物品回報；consume 為 true 時回報會交出這些物品 */
  z.object({ type: z.literal('collect'), itemId: z.string().min(1), count: z.number().int().positive(), consume: z.boolean() }),
]);
export type Objective = z.infer<typeof objectiveSchema>;

export const questDefSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  /** 任務說明（追蹤列與任務日誌） */
  descKey: z.string().min(1),
  /** 交付任務與回報的 NPC */
  giver: z.string().min(1),
  /** 前置任務：全部完成後才可接取 */
  requires: z.array(z.string().min(1)),
  objectives: z.array(objectiveSchema).min(1),
  rewards: z.object({
    items: z.array(itemStack).optional(),
    /** 完成後改變的區域迷霧（規格 1.4：任務完成會降低迷霧） */
    mist: z.array(z.object({ region: z.enum(regionIds), stage: z.enum(mistStages) })).optional(),
  }),
});
export type QuestDef = z.infer<typeof questDefSchema>;
export type QuestCatalog = ReadonlyMap<string, QuestDef>;

/** 權威狀態中的任務紀錄（沒有紀錄 = 尚未接取） */
export type QuestRecord = { status: 'active' | 'completed' };
export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';

export function parseQuests(raw: unknown, refs: { items: ReadonlySet<string>; npcs: ReadonlySet<string> }): Map<string, QuestDef> {
  const list = z.array(questDefSchema).parse(raw);
  const map = new Map<string, QuestDef>();
  for (const q of list) {
    if (map.has(q.id)) throw new Error(`任務 id 重複：${q.id}`);
    if (!refs.npcs.has(q.giver)) throw new Error(`任務 ${q.id} 的 NPC 不存在：${q.giver}`);
    const items = [...q.objectives.map((o) => o.itemId), ...(q.rewards.items ?? []).map((i) => i.itemId)];
    for (const id of items) if (!refs.items.has(id)) throw new Error(`任務 ${q.id} 參照不存在的物品：${id}`);
    map.set(q.id, q);
  }
  for (const q of map.values()) {
    for (const r of q.requires) if (!map.has(r)) throw new Error(`任務 ${q.id} 的前置任務不存在：${r}`);
  }
  return map;
}

type QuestState = {
  quests: Readonly<Record<string, QuestRecord>>;
  inventory: Parameters<typeof countItem>[0];
};

export function questStatus(state: QuestState, def: QuestDef): QuestStatus {
  const record = state.quests[def.id];
  if (record) return record.status;
  return def.requires.every((r) => state.quests[r]?.status === 'completed') ? 'available' : 'locked';
}

/** 每個目標目前的進度（current 不超過 target） */
export function objectiveProgress(state: QuestState, def: QuestDef): { current: number; target: number }[] {
  return def.objectives.map((o) => {
    switch (o.type) {
      case 'collect':
        return { current: Math.min(countItem(state.inventory, o.itemId), o.count), target: o.count };
    }
  });
}

/** 進行中且所有目標都達成，可以回報 */
export function isQuestReady(state: QuestState, def: QuestDef): boolean {
  return questStatus(state, def) === 'active' && objectiveProgress(state, def).every((p) => p.current >= p.target);
}

/** 回報時要交出的物品 */
export function questConsumption(def: QuestDef): ItemStack[] {
  return def.objectives.flatMap((o) => (o.type === 'collect' && o.consume ? [{ itemId: o.itemId, count: o.count }] : []));
}
