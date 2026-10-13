// 玩家背包（規格 6.3）：格子制、堆疊上限、取得 / 消耗、材料檢查。
// 純函式，不修改輸入；所有變更回傳新的背包。
import type { ItemCatalog, ItemStack } from '../items/items';

export type InventorySlot = ItemStack | null;
export type Inventory = { readonly slots: readonly InventorySlot[] };

export const INVENTORY_SIZE = 24;

export function createInventory(size = INVENTORY_SIZE): Inventory {
  return { slots: Array.from({ length: size }, () => null) };
}

export function countItem(inv: Inventory, itemId: string): number {
  let total = 0;
  for (const slot of inv.slots) if (slot?.itemId === itemId) total += slot.count;
  return total;
}

/** 合併同 id 的需求（例如 [木材 2, 木材 3] → 木材 5） */
function mergeStacks(stacks: readonly ItemStack[]): ItemStack[] {
  const merged = new Map<string, number>();
  for (const s of stacks) merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.count);
  return [...merged].map(([itemId, count]) => ({ itemId, count }));
}

export function hasItems(inv: Inventory, required: readonly ItemStack[]): boolean {
  return mergeStacks(required).every((r) => countItem(inv, r.itemId) >= r.count);
}

/**
 * 加入物品：先補滿既有同類格子，再放入空格。
 * 全部放得下才成功（回傳新背包）；放不下任何一部分時回傳 null，背包不變——
 * 避免唯一獎勵只拿到一半。未知物品視為錯誤。
 */
export function addItems(inv: Inventory, stacks: readonly ItemStack[], catalog: ItemCatalog): Inventory | null {
  const slots = inv.slots.map((s) => (s ? { ...s } : null));
  for (const { itemId, count } of mergeStacks(stacks)) {
    const def = catalog.get(itemId);
    if (!def) throw new Error(`未知的物品：${itemId}`);
    let remaining = count;
    for (const slot of slots) {
      if (remaining === 0) break;
      if (slot?.itemId !== itemId || slot.count >= def.maxStack) continue;
      const moved = Math.min(def.maxStack - slot.count, remaining);
      slot.count += moved;
      remaining -= moved;
    }
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      if (slots[i]) continue;
      const moved = Math.min(def.maxStack, remaining);
      slots[i] = { itemId, count: moved };
      remaining -= moved;
    }
    if (remaining > 0) return null;
  }
  return { slots };
}

/** 消耗物品：數量不足時回傳 null（背包不變）；從後面的格子開始扣，空格清為 null。 */
export function removeItems(inv: Inventory, stacks: readonly ItemStack[]): Inventory | null {
  if (!hasItems(inv, stacks)) return null;
  const slots = inv.slots.map((s) => (s ? { ...s } : null));
  for (const { itemId, count } of mergeStacks(stacks)) {
    let remaining = count;
    for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = slots[i];
      if (slot?.itemId !== itemId) continue;
      const taken = Math.min(slot.count, remaining);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count === 0) slots[i] = null;
    }
  }
  return { slots };
}
