// 物品定義與掉落表（規格 6.3：物品定義與玩家背包分離；6.2：資源有數量與條件）。
import { z } from 'zod';
import { equipEffectSchema, equipSpecSchema } from '../equipment/equipment';

/** consumable：藥膏與藥水（任務 8C 的獎勵；使用功能在之後的任務加入）；currency：種籽幣（任務 7G，商店之後再做） */
export const itemCategories = ['material', 'special', 'quest', 'consumable', 'currency', 'equipment'] as const;

export const itemDefSchema = z.object({
  id: z.string().min(1),
  /** 名稱與說明（i18n key） */
  nameKey: z.string().min(1),
  descKey: z.string().min(1),
  /** 圖示 id（UI 以此選擇圖示） */
  icon: z.string().min(1),
  category: z.enum(itemCategories),
  /** 單格堆疊上限 */
  maxStack: z.number().int().positive(),
  /** 可以使用（任務 7I，Bible §25.3）：回復 heal 點體力；cureSlow 時同時解除泥巴 / 孢子造成的緩速 */
  use: z.object({ heal: z.number().int().positive(), cureSlow: z.boolean().optional() }).optional(),
  /** 裝備（第二章 Phase 2）：裝到哪個格、數值與效果（規格 §7.3） */
  equip: equipSpecSchema.optional(),
  /** 被動效果：放在背包裡就生效，不必裝備（水行護符） */
  passive: z.array(equipEffectSchema).min(1).optional(),
});
export type ItemDef = z.infer<typeof itemDefSchema>;

export const lootTableSchema = z.object({
  id: z.string().min(1),
  drops: z
    .array(
      z
        .object({
          itemId: z.string().min(1),
          min: z.number().int().nonnegative(),
          max: z.number().int().positive(),
          /** 掉落機率（0–1，預設 1） */
          chance: z.number().min(0).max(1).optional(),
          /** 稀有項目：守林者護腕的稀有掉落加成只套用在這些項目（機率乘上加成） */
          rare: z.boolean().optional(),
        })
        .refine((d) => d.max >= d.min, { message: 'max 必須 ≥ min' }),
    )
    .min(1),
});
export type LootTable = z.infer<typeof lootTableSchema>;

export type ItemStack = { itemId: string; count: number };
export type ItemCatalog = ReadonlyMap<string, ItemDef>;
export type LootTables = ReadonlyMap<string, LootTable>;

export class ItemDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ItemDataError';
  }
}

/** 驗證物品與掉落表；掉落表只能參照存在的物品。失敗時拋出 ItemDataError。 */
export function parseItemData(rawItems: unknown, rawLootTables: unknown): { items: ItemCatalog; lootTables: LootTables } {
  const itemList = z.array(itemDefSchema).safeParse(rawItems);
  if (!itemList.success) throw new ItemDataError(`items 資料格式錯誤：${z.prettifyError(itemList.error)}`);
  const tableList = z.array(lootTableSchema).safeParse(rawLootTables);
  if (!tableList.success) throw new ItemDataError(`lootTables 資料格式錯誤：${z.prettifyError(tableList.error)}`);

  const items = new Map<string, ItemDef>();
  for (const item of itemList.data) {
    if (items.has(item.id)) throw new ItemDataError(`物品 id 重複：${item.id}`);
    items.set(item.id, item);
  }
  const lootTables = new Map<string, LootTable>();
  for (const table of tableList.data) {
    if (lootTables.has(table.id)) throw new ItemDataError(`掉落表 id 重複：${table.id}`);
    for (const drop of table.drops) {
      if (!items.has(drop.itemId)) throw new ItemDataError(`掉落表 ${table.id} 參照不存在的物品：${drop.itemId}`);
    }
    lootTables.set(table.id, table);
  }
  return { items, lootTables };
}

/** 擲一次掉落表。random 由呼叫端注入（測試用固定種子，伺服器用自己的亂數）。數量 0 的項目不列出。 */
export function rollLoot(table: LootTable, random: () => number, rareBonus = 0): ItemStack[] {
  const result: ItemStack[] = [];
  for (const drop of table.drops) {
    const chance = drop.chance !== undefined && drop.rare ? Math.min(1, drop.chance * (1 + rareBonus)) : drop.chance;
    if (chance !== undefined && random() >= chance) continue;
    const count = drop.min + Math.floor(random() * (drop.max - drop.min + 1));
    if (count <= 0) continue;
    const existing = result.find((s) => s.itemId === drop.itemId);
    if (existing) existing.count += count;
    else result.push({ itemId: drop.itemId, count });
  }
  return result;
}
