// 快速使用回復藥（任務 7I）：選出這次要用的藥。純函式。
import { countItem, type Inventory } from '../inventory/inventory';
import type { ItemCatalog } from './items';

/**
 * 被緩速時優先用能解除緩速的藥膏；否則用回復量最小的藥（不浪費好藥）。
 * 體力已滿且沒有被緩速時不用（回傳 null）；身上沒有可用的藥也回傳 null。
 */
export function chooseQuickHeal(inventory: Inventory, items: ItemCatalog, status: { hp: number; maxHp: number; slowed: boolean }): string | null {
  const owned = [...items.values()].filter((d) => d.use && countItem(inventory, d.id) > 0);
  if (status.slowed) {
    const cure = owned.filter((d) => d.use?.cureSlow).sort((a, b) => a.use!.heal - b.use!.heal)[0];
    if (cure) return cure.id;
  }
  if (status.hp >= status.maxHp) return null;
  return owned.sort((a, b) => a.use!.heal - b.use!.heal)[0]?.id ?? null;
}
