import { describe, expect, it } from 'vitest';
import { TERRAIN_SIZE } from '../world/terrain';
import {
  cellCenter,
  cellIndexAt,
  cellsToReveal,
  createExplored,
  decodeExplored,
  encodeExplored,
  EXPLORE_CELL,
  EXPLORE_CELLS,
  exploredRatio,
  isCellExplored,
  isExploredAt,
  REVEAL_RADIUS,
  withCells,
} from './explore';

describe('explore', () => {
  it('座標與格子互相轉換；地圖外為 null', () => {
    const index = cellIndexAt(10, -20)!;
    const c = cellCenter(index);
    expect(Math.abs(c.x - 10)).toBeLessThanOrEqual(EXPLORE_CELL / 2);
    expect(Math.abs(c.z + 20)).toBeLessThanOrEqual(EXPLORE_CELL / 2);
    expect(cellIndexAt(TERRAIN_SIZE, 0)).toBeNull();
    expect(cellIndexAt(0, -TERRAIN_SIZE)).toBeNull();
  });

  it('站在某處會揭開半徑內的格子，已探索的不重複', () => {
    const empty = createExplored();
    const cells = cellsToReveal(empty, 0, 18);
    expect(cells.length).toBeGreaterThan(20);
    for (const c of cells) {
      const p = cellCenter(c);
      expect(Math.hypot(p.x, p.z - 18)).toBeLessThanOrEqual(REVEAL_RADIUS);
    }
    const after = withCells(empty, cells);
    expect(isExploredAt(after, 0, 18)).toBe(true);
    expect(isExploredAt(after, 100, -100)).toBe(false);
    expect(cellsToReveal(after, 0, 18)).toEqual([]);
    // 不修改輸入
    expect(exploredRatio(empty)).toBe(0);
  });

  it('withCells 略過無效索引', () => {
    const bits = withCells(createExplored(), [-1, EXPLORE_CELLS, 1.5, 3]);
    expect(isCellExplored(bits, 3)).toBe(true);
    expect(exploredRatio(bits)).toBeCloseTo(1 / EXPLORE_CELLS);
  });

  it('base64 編碼可以讀回；長度不符或格式錯誤回傳 null', () => {
    const bits = withCells(createExplored(), [0, 7, 8, 100, EXPLORE_CELLS - 1]);
    const text = encodeExplored(bits);
    expect(decodeExplored(text)).toEqual(bits);
    expect(decodeExplored(encodeExplored(createExplored()))).toEqual(createExplored());
    expect(decodeExplored('AAAA')).toBeNull();
    expect(decodeExplored('**not base64**')).toBeNull();
  });
});
