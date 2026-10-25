import { describe, expect, it } from 'vitest';
import items from '@/data/items.json';
import buildables from '@/data/buildables.json';
import { itemIconIds } from './ItemIcon';

describe('物品圖示', () => {
  it('每個物品的 icon 都有畫（畫面上不會出現「?」）', () => {
    for (const item of items) expect(itemIconIds, item.id).toContain(item.icon);
  });

  it('每個建造物的 icon 都有畫', () => {
    for (const b of buildables) expect(itemIconIds, b.id).toContain(b.icon);
  });
});
