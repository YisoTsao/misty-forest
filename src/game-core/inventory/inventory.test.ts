import { describe, expect, it } from 'vitest';
import { testItems } from '../testing/fixtures';
import { addItems, countItem, createInventory, hasItems, removeItems } from './inventory';

const catalog = new Map(testItems.map((i) => [i.id, i]));

describe('inventory', () => {
  it('新背包為指定格數的空格', () => {
    const inv = createInventory(4);
    expect(inv.slots).toEqual([null, null, null, null]);
  });

  it('同類物品先補滿既有格子，超過上限再開新格', () => {
    let inv = addItems(createInventory(4), [{ itemId: 'wood', count: 7 }], catalog)!;
    inv = addItems(inv, [{ itemId: 'wood', count: 6 }], catalog)!;
    expect(inv.slots).toEqual([{ itemId: 'wood', count: 10 }, { itemId: 'wood', count: 3 }, null, null]);
    expect(countItem(inv, 'wood')).toBe(13);
  });

  it('全部放得下才成功；放不下時回傳 null 且原背包不變', () => {
    const inv = addItems(createInventory(2), [{ itemId: 'wood', count: 15 }], catalog)!;
    expect(addItems(inv, [{ itemId: 'wood', count: 3 }, { itemId: 'flower', count: 1 }], catalog)).toBeNull();
    expect(countItem(inv, 'wood')).toBe(15);
    expect(addItems(inv, [{ itemId: 'wood', count: 5 }], catalog)?.slots).toEqual([
      { itemId: 'wood', count: 10 },
      { itemId: 'wood', count: 10 },
    ]);
  });

  it('不修改輸入的背包', () => {
    const inv = addItems(createInventory(2), [{ itemId: 'wood', count: 1 }], catalog)!;
    addItems(inv, [{ itemId: 'wood', count: 1 }], catalog);
    expect(inv.slots[0]).toEqual({ itemId: 'wood', count: 1 });
  });

  it('未知物品拋錯（資料錯誤不可默默略過）', () => {
    expect(() => addItems(createInventory(2), [{ itemId: 'ghost', count: 1 }], catalog)).toThrow(/ghost/);
  });

  it('材料檢查合併同類需求', () => {
    const inv = addItems(createInventory(4), [{ itemId: 'wood', count: 4 }], catalog)!;
    expect(hasItems(inv, [{ itemId: 'wood', count: 4 }])).toBe(true);
    expect(hasItems(inv, [{ itemId: 'wood', count: 2 }, { itemId: 'wood', count: 3 }])).toBe(false);
    expect(hasItems(inv, [{ itemId: 'flower', count: 1 }])).toBe(false);
  });

  it('消耗物品：從後面的格子扣、空格清除；數量不足時回傳 null', () => {
    const inv = addItems(createInventory(3), [{ itemId: 'wood', count: 13 }, { itemId: 'flower', count: 2 }], catalog)!;
    const after = removeItems(inv, [{ itemId: 'wood', count: 5 }])!;
    expect(after.slots).toEqual([{ itemId: 'wood', count: 8 }, null, { itemId: 'flower', count: 2 }]);
    expect(removeItems(inv, [{ itemId: 'flower', count: 3 }])).toBeNull();
    expect(countItem(inv, 'wood')).toBe(13);
  });
});
