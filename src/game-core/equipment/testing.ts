// 測試用：依整個狀態算裝備倍率（與 rules.ts 的 modifiersOf 相同，但不需要 RulesContext）。
import { equipmentModifiers, type Modifiers } from './equipment';
import type { GameState } from '../authority/rules';
import type { ItemCatalog } from '../items/items';

export function currentModifiersFor(state: GameState, ctx: { items: ItemCatalog }): Modifiers {
  const held = state.inventory.slots.flatMap((s) => (s ? [s.itemId] : []));
  return equipmentModifiers(state.equipment, held, (id) => ctx.items.get(id), state.player.weapon);
}
