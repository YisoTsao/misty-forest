import { describe, expect, it } from 'vitest';
import items from '@/data/items.json';
import lootTables from '@/data/lootTables.json';
import { testItems } from '../testing/fixtures';
import { mulberry32 } from '../util/random';
import { ItemDataError, parseItemData, rollLoot, type LootTable } from './items';

describe('parseItemData', () => {
  it('專案的物品與掉落表資料合法', () => {
    const parsed = parseItemData(items, lootTables);
    expect(parsed.items.get('wood')?.maxStack).toBeGreaterThan(1);
    expect(parsed.lootTables.has('wood_basic')).toBe(true);
  });

  it('拒絕參照不存在物品的掉落表', () => {
    expect(() => parseItemData(testItems, [{ id: 'x', drops: [{ itemId: 'ghost', min: 1, max: 1 }] }])).toThrow(ItemDataError);
  });

  it('拒絕重複 id 與 max < min', () => {
    expect(() => parseItemData([...testItems, testItems[0]], [])).toThrow(/重複/);
    expect(() => parseItemData(testItems, [{ id: 'x', drops: [{ itemId: 'wood', min: 3, max: 1 }] }])).toThrow(ItemDataError);
  });
});

describe('rollLoot', () => {
  const table: LootTable = {
    id: 't',
    drops: [
      { itemId: 'wood', min: 2, max: 4 },
      { itemId: 'flower', min: 1, max: 1, chance: 0.25 },
    ],
  };

  it('數量落在 min–max 之間，同一種子結果相同', () => {
    const a = rollLoot(table, mulberry32(7));
    expect(a).toEqual(rollLoot(table, mulberry32(7)));
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      const wood = rollLoot(table, rng).find((s) => s.itemId === 'wood')!.count;
      expect(wood).toBeGreaterThanOrEqual(2);
      expect(wood).toBeLessThanOrEqual(4);
    }
  });

  it('chance 控制掉落機率', () => {
    const rng = mulberry32(11);
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (rollLoot(table, rng).some((s) => s.itemId === 'flower')) hits++;
    expect(hits / 2000).toBeGreaterThan(0.2);
    expect(hits / 2000).toBeLessThan(0.3);
  });
});
