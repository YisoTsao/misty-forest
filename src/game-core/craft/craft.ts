// 製作（任務 7J，Bible §26.1–26.2）：工作台與配方。配方依任務進度解鎖；材料不足時列出缺少的數量。純資料與純函式。
import { z } from 'zod';
import { countItem, type Inventory } from '../inventory/inventory';
import type { ItemCatalog, ItemStack } from '../items/items';

const stack = z.object({ itemId: z.string().min(1), count: z.number().int().positive() });

export const craftDataSchema = z.object({
  /** 工作台：名稱與負責的 NPC（和 NPC 對話時打開） */
  stations: z.array(z.object({ id: z.string().min(1), nameKey: z.string().min(1), npc: z.string().min(1) })).min(1),
  recipes: z
    .array(
      z.object({
        id: z.string().min(1),
        station: z.string().min(1),
        output: stack,
        inputs: z.array(stack).min(1),
        /** 這個任務完成後才會做（Bible：配方來自任務獎勵） */
        requires: z.object({ questCompleted: z.string().min(1) }).optional(),
      }),
    )
    .min(1),
});
export type CraftData = z.infer<typeof craftDataSchema>;
export type RecipeDef = CraftData['recipes'][number];
export type StationDef = CraftData['stations'][number];

export function parseCraftData(raw: unknown, refs: { items: ItemCatalog; npcs: ReadonlySet<string>; quests: ReadonlySet<string> }): CraftData {
  const data = craftDataSchema.parse(raw);
  const stations = new Set<string>();
  for (const s of data.stations) {
    if (stations.has(s.id)) throw new Error(`工作台 id 重複：${s.id}`);
    if (!refs.npcs.has(s.npc)) throw new Error(`工作台 ${s.id} 的 NPC 不存在：${s.npc}`);
    stations.add(s.id);
  }
  const ids = new Set<string>();
  for (const r of data.recipes) {
    if (ids.has(r.id)) throw new Error(`配方 id 重複：${r.id}`);
    ids.add(r.id);
    if (!stations.has(r.station)) throw new Error(`配方 ${r.id} 的工作台不存在：${r.station}`);
    for (const s of [r.output, ...r.inputs]) {
      const item = refs.items.get(s.itemId);
      if (!item) throw new Error(`配方 ${r.id} 參照不存在的物品：${s.itemId}`);
      // Bible §25.2：主線關鍵物品不能用於一般配方
      if (item.category === 'quest') throw new Error(`配方 ${r.id} 不能使用或產出任務物品：${s.itemId}`);
    }
    if (r.requires && !refs.quests.has(r.requires.questCompleted)) throw new Error(`配方 ${r.id} 參照不存在的任務：${r.requires.questCompleted}`);
  }
  return data;
}

/** 這個工作台目前會做的配方 */
export function unlockedRecipes(data: CraftData, station: string, quests: Readonly<Record<string, { status: string }>>): RecipeDef[] {
  return data.recipes.filter((r) => r.station === station && (!r.requires || quests[r.requires.questCompleted]?.status === 'completed'));
}

/** 缺少的材料（數量為還差多少）；不缺時為空陣列 */
export function missingInputs(inventory: Inventory, recipe: RecipeDef): ItemStack[] {
  return recipe.inputs.flatMap((i) => {
    const lack = i.count - countItem(inventory, i.itemId);
    return lack > 0 ? [{ itemId: i.itemId, count: lack }] : [];
  });
}
