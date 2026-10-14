import { describe, expect, it } from 'vitest';
import { addItems, createInventory } from '../inventory/inventory';
import type { ItemDef } from './items';
import { chooseQuickHeal } from './consumables';

const def = (id: string, use?: ItemDef['use']): ItemDef => ({ id, nameKey: id, descKey: id, icon: id, category: 'consumable', maxStack: 20, use });
const items = new Map([
  ['potion', def('potion', { heal: 35 })],
  ['salve', def('salve', { heal: 50, cureSlow: true })],
  ['wood', { ...def('wood'), category: 'material' as const }],
]);
const inv = (ids: string[]) => addItems(createInventory(), ids.map((itemId) => ({ itemId, count: 1 })), items)!;

describe('快速使用回復藥', () => {
  it('一般情況用回復量最小的藥', () => {
    expect(chooseQuickHeal(inv(['salve', 'potion']), items, { hp: 40, maxHp: 100, slowed: false })).toBe('potion');
    expect(chooseQuickHeal(inv(['salve']), items, { hp: 40, maxHp: 100, slowed: false })).toBe('salve');
  });
  it('被緩速時優先用能解除緩速的藥膏，體力滿也可以', () => {
    expect(chooseQuickHeal(inv(['salve', 'potion']), items, { hp: 100, maxHp: 100, slowed: true })).toBe('salve');
  });
  it('體力滿且沒被緩速、或沒有藥時不用', () => {
    expect(chooseQuickHeal(inv(['potion']), items, { hp: 100, maxHp: 100, slowed: false })).toBeNull();
    expect(chooseQuickHeal(inv(['wood']), items, { hp: 10, maxHp: 100, slowed: true })).toBeNull();
  });
});
