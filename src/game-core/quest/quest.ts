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
  /** 修好指定的物件（木橋） */
  z.object({ type: z.literal('repair'), placementId: z.string().min(1), descKey: z.string().min(1) }),
  /** 啟動指定的機關（任務 8C：點亮路燈、移開樹根、打開閘門、喚醒苔蘚節點）；進度為已啟動的數量 */
  z.object({ type: z.literal('activate'), placementIds: z.array(z.string().min(1)).min(1), descKey: z.string().min(1) }),
  /** 接取後擊敗指定數量的敵人；達到里程碑時改變區域迷霧 */
  z.object({
    type: z.literal('defeat'),
    enemy: z.string().min(1),
    count: z.number().int().positive(),
    descKey: z.string().min(1),
    milestones: z.array(z.object({ count: z.number().int().positive(), region: z.enum(regionIds), stage: z.enum(mistStages) })).optional(),
  }),
  /** 擊敗頭目（任務 8D-2）：以「已擊敗的頭目」判斷，接任務前就打倒的也算 */
  z.object({ type: z.literal('boss'), boss: z.string().min(1), descKey: z.string().min(1) }),
  /** 在家園蓋出指定數量的建造物（任務 7K 花圃）：以目前已放置的數量判斷 */
  z.object({ type: z.literal('build'), buildable: z.string().min(1), count: z.number().int().positive(), descKey: z.string().min(1) }),
  /**
   * 和某位 NPC 談（任務 7G 送信）：在對話選項裡完成（效果 questTalk），item 為交出去的物品。
   * 進度存完成的順序（1、2、3…），對話可以依「誰是第一個」換台詞。
   */
  z.object({ type: z.literal('talk'), npc: z.string().min(1), item: z.string().min(1).optional(), descKey: z.string().min(1) }),
]);
export type Objective = z.infer<typeof objectiveSchema>;

/** 任務日誌的分類（Bible §31.2）：主線、支線、角色故事、收集、世界事件 */
export const questCategories = ['main', 'side', 'story', 'collect', 'event'] as const;
export type QuestCategory = (typeof questCategories)[number];
/** 主線以外的任務最多同時追蹤幾個（Bible §31.3：避免 HUD 擠滿任務） */
export const MAX_TRACKED_SIDE = 3;

export const questDefSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  category: z.enum(questCategories).default('side'),
  /** 任務說明（追蹤列與任務日誌） */
  descKey: z.string().min(1),
  /** 交付任務與回報的 NPC */
  giver: z.string().min(1),
  /** 前置任務：全部完成後才可接取 */
  requires: z.array(z.string().min(1)),
  objectives: z.array(objectiveSchema).min(1),
  /** 接取時拿到的物品（任務 7G：要送的信） */
  start: z.object({ items: z.array(itemStack).min(1) }).optional(),
  rewards: z.object({
    items: z.array(itemStack).optional(),
    /** 完成後改變的區域迷霧（規格 1.4：任務完成會降低迷霧） */
    mist: z.array(z.object({ region: z.enum(regionIds), stage: z.enum(mistStages) })).optional(),
    /** 完成後啟動的物件（任務 8C：苔冠空地入口的樹根退開） */
    objects: z.array(z.string().min(1)).optional(),
  }),
});
export type QuestDef = z.infer<typeof questDefSchema>;
export type QuestCatalog = ReadonlyMap<string, QuestDef>;

/** 權威狀態中的任務紀錄（沒有紀錄 = 尚未接取）；progress 為擊敗目標等需要累計的進度 */
/** untracked：玩家在任務日誌取消追蹤（主線一定追蹤，任務 7F） */
export type QuestRecord = { status: 'active' | 'completed'; progress?: number[]; untracked?: true };
export type QuestStatus = 'locked' | 'available' | 'active' | 'completed';

export function parseQuests(
  raw: unknown,
  refs: { items: ReadonlySet<string>; npcs: ReadonlySet<string>; enemies?: ReadonlySet<string>; placements?: ReadonlySet<string> },
): Map<string, QuestDef> {
  const list = z.array(questDefSchema).parse(raw);
  const map = new Map<string, QuestDef>();
  for (const q of list) {
    if (map.has(q.id)) throw new Error(`任務 id 重複：${q.id}`);
    if (!refs.npcs.has(q.giver)) throw new Error(`任務 ${q.id} 的 NPC 不存在：${q.giver}`);
    const items = [
      ...q.objectives.flatMap((o) => (o.type === 'collect' ? [o.itemId] : [])),
      ...(q.rewards.items ?? []).map((i) => i.itemId),
      ...(q.start?.items ?? []).map((i) => i.itemId),
      ...q.objectives.flatMap((o) => (o.type === 'talk' && o.item ? [o.item] : [])),
    ];
    for (const id of items) if (!refs.items.has(id)) throw new Error(`任務 ${q.id} 參照不存在的物品：${id}`);
    for (const o of q.objectives) {
      if (o.type === 'defeat' && refs.enemies && !refs.enemies.has(o.enemy)) throw new Error(`任務 ${q.id} 參照不存在的敵人：${o.enemy}`);
      if (o.type === 'talk' && !refs.npcs.has(o.npc)) throw new Error(`任務 ${q.id} 參照不存在的 NPC：${o.npc}`);
      if (o.type === 'boss' && refs.enemies && !refs.enemies.has(o.boss)) throw new Error(`任務 ${q.id} 參照不存在的頭目：${o.boss}`);
    }
    if (refs.placements) {
      const ids = [
        ...q.objectives.flatMap((o) => (o.type === 'activate' ? o.placementIds : o.type === 'repair' ? [o.placementId] : [])),
        ...(q.rewards.objects ?? []),
      ];
      for (const id of ids) if (!refs.placements.has(id)) throw new Error(`任務 ${q.id} 參照不存在的物件：${id}`);
    }
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
  objects: ReadonlyMap<string, { repaired?: boolean; active?: boolean }>;
  /** 已擊敗的頭目（省略視為沒有） */
  defeatedBosses?: readonly string[];
  /** 已放置的建造物（省略視為沒有） */
  buildings?: readonly { buildable: string }[];
};

export function questStatus(state: QuestState, def: QuestDef): QuestStatus {
  const record = state.quests[def.id];
  if (record) return record.status;
  return def.requires.every((r) => state.quests[r]?.status === 'completed') ? 'available' : 'locked';
}

/** 每個目標目前的進度（current 不超過 target） */
export function objectiveProgress(state: QuestState, def: QuestDef): { current: number; target: number }[] {
  return def.objectives.map((o, i) => {
    switch (o.type) {
      case 'collect':
        return { current: Math.min(countItem(state.inventory, o.itemId), o.count), target: o.count };
      case 'repair':
        return { current: state.objects.get(o.placementId)?.repaired ? 1 : 0, target: 1 };
      case 'activate':
        return { current: o.placementIds.filter((id) => state.objects.get(id)?.active === true).length, target: o.placementIds.length };
      case 'defeat':
        return { current: Math.min(state.quests[def.id]?.progress?.[i] ?? 0, o.count), target: o.count };
      case 'boss':
        return { current: state.defeatedBosses?.includes(o.boss) ? 1 : 0, target: 1 };
      case 'talk':
        return { current: (state.quests[def.id]?.progress?.[i] ?? 0) > 0 ? 1 : 0, target: 1 };
      case 'build':
        return { current: Math.min(o.count, (state.buildings ?? []).filter((b) => b.buildable === o.buildable).length), target: o.count };
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

/** 這個物件所屬的目標之前的目標是否都已完成（機關 / 修理的 ordered；物件不在任務目標裡時視為 true） */
export function earlierObjectivesDone(state: QuestState, def: QuestDef, placementId: string): boolean {
  const index = def.objectives.findIndex((o) => (o.type === 'activate' ? o.placementIds.includes(placementId) : o.type === 'repair' && o.placementId === placementId));
  if (index <= 0) return true;
  return objectiveProgress(state, def)
    .slice(0, index)
    .every((p) => p.current >= p.target);
}

/** 是否顯示在畫面上的任務追蹤列（主線一定顯示；其他任務沒有取消追蹤就顯示） */
export function isQuestTracked(record: QuestRecord | undefined, def: QuestDef): boolean {
  return record?.status === 'active' && (def.category === 'main' || record.untracked !== true);
}

/** 目前追蹤中的非主線任務數 */
export function trackedSideCount(quests: Readonly<Record<string, QuestRecord>>, catalog: QuestCatalog): number {
  return Object.entries(quests).filter(([id, r]) => {
    const def = catalog.get(id);
    return def !== undefined && def.category !== 'main' && isQuestTracked(r, def);
  }).length;
}

/** 這個任務裡和 npc 談的目標索引（沒有時 -1） */
export function talkObjectiveIndex(def: QuestDef, npc: string): number {
  return def.objectives.findIndex((o) => o.type === 'talk' && o.npc === npc);
}

/** 已完成的談話目標數 */
export function talksDone(record: QuestRecord | undefined, def: QuestDef): number {
  return def.objectives.filter((o, i) => o.type === 'talk' && (record?.progress?.[i] ?? 0) > 0).length;
}
