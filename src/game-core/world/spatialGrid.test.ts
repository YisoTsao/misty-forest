import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './spatialGrid';

const items = [
  { id: 'a', x: 0, z: 0 },
  { id: 'b', x: 3, z: 4 }, // 距原點 5
  { id: 'c', x: -9.9, z: 0 },
  { id: 'd', x: 40, z: -40 },
];

describe('SpatialGrid', () => {
  it('只回傳半徑內的項目（含邊界）', () => {
    const grid = new SpatialGrid(items, 8);
    expect(grid.query(0, 0, 5).map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(grid.query(0, 0, 10).map((i) => i.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('跨越多個格子與負座標都正確', () => {
    const grid = new SpatialGrid(items, 2);
    expect(grid.query(-9, 1, 1.5).map((i) => i.id)).toEqual(['c']);
    expect(grid.query(40, -40, 0.1).map((i) => i.id)).toEqual(['d']);
  });

  it('結果與暴力搜尋一致', () => {
    const rand = (() => {
      let s = 1;
      return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 200 - 100;
    })();
    const many = Array.from({ length: 500 }, (_, i) => ({ id: String(i), x: rand(), z: rand() }));
    const grid = new SpatialGrid(many, 7);
    for (let k = 0; k < 20; k++) {
      const [x, z, r] = [rand(), rand(), Math.abs(rand()) / 4];
      const expected = many.filter((i) => Math.hypot(i.x - x, i.z - z) <= r).map((i) => i.id).sort();
      expect(grid.query(x, z, r).map((i) => i.id).sort()).toEqual(expected);
    }
  });

  it('重複使用輸出陣列時會先清空', () => {
    const grid = new SpatialGrid(items, 8);
    const out = grid.query(0, 0, 10);
    grid.query(40, -40, 1, out);
    expect(out.map((i) => i.id)).toEqual(['d']);
  });

  it('拒絕非正數的格子大小', () => {
    expect(() => new SpatialGrid(items, 0)).toThrow();
  });
});
