// 商店（任務 7H，Bible §25.2、§26.3）：以種籽幣買賣。庫存依地圖進度解鎖（任務完成）；
// 主線關鍵物品（quest 分類）與貨幣本身不能買賣，避免玩家賣掉唯一材料而卡關。純資料與純函式。
import { z } from 'zod';
import type { ItemCatalog } from '../items/items';

/** 種籽幣的物品 id */
export const COIN = 'seed_coin';
/** 一次最多買賣幾個 */
export const MAX_TRADE = 99;

const price = z.number().int().positive();

export const shopDefSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  /** 經營的 NPC */
  npc: z.string().min(1),
  /** 販售的物品；requires 未達成時不顯示 */
  stock: z.array(z.object({ itemId: z.string().min(1), price, requires: z.object({ questCompleted: z.string().min(1) }).optional() })).min(1),
  /** 回收的物品與每個的收購價 */
  buys: z.array(z.object({ itemId: z.string().min(1), price })),
});
export type ShopDef = z.infer<typeof shopDefSchema>;
export type ShopCatalog = ReadonlyMap<string, ShopDef>;

export function parseShops(raw: unknown, refs: { items: ItemCatalog; npcs: ReadonlySet<string>; quests: ReadonlySet<string> }): Map<string, ShopDef> {
  const list = z.array(shopDefSchema).parse(raw);
  const map = new Map<string, ShopDef>();
  for (const shop of list) {
    if (map.has(shop.id)) throw new Error(`商店 id 重複：${shop.id}`);
    if (!refs.npcs.has(shop.npc)) throw new Error(`商店 ${shop.id} 的 NPC 不存在：${shop.npc}`);
    for (const entry of [...shop.stock, ...shop.buys]) {
      const item = refs.items.get(entry.itemId);
      if (!item) throw new Error(`商店 ${shop.id} 參照不存在的物品：${entry.itemId}`);
      if (item.category === 'quest' || item.category === 'currency') throw new Error(`商店 ${shop.id} 不能買賣任務物品或貨幣：${entry.itemId}`);
    }
    for (const s of shop.stock) if (s.requires && !refs.quests.has(s.requires.questCompleted)) throw new Error(`商店 ${shop.id} 參照不存在的任務：${s.requires.questCompleted}`);
    map.set(shop.id, shop);
  }
  return map;
}

/** 目前買得到的物品（依任務進度解鎖） */
export function availableStock(shop: ShopDef, quests: Readonly<Record<string, { status: string }>>): ShopDef['stock'] {
  return shop.stock.filter((s) => !s.requires || quests[s.requires.questCompleted]?.status === 'completed');
}
