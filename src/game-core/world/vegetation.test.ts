import { describe, expect, it } from 'vitest';
import { qualityPresets } from '../settings/quality';
import { flowerPatchMask, offPath, scatterChunk } from './vegetation';
import { distanceToPath, PATH_HALF_WIDTH, terrainHeight } from './terrain';

describe('scatterChunk', () => {
  it('同一區塊與種子結果相同（可重現）', () => {
    const a = scatterChunk(16, 32, 16, { density: 1, seed: 3 });
    const b = scatterChunk(16, 32, 16, { density: 1, seed: 3 });
    expect(a).toEqual(b);
    expect(scatterChunk(16, 32, 16, { density: 1, seed: 4 })).not.toEqual(a);
  });

  it('數量約為 密度 × 面積（扣掉小路）、都在區塊內、貼齊地形高度', () => {
    // 遠離小路的區塊
    const list = scatterChunk(40, -60, 16, { density: 2, seed: 1 });
    expect(list.length).toBeGreaterThan(16 * 16 * 2 * 0.85);
    expect(list.length).toBeLessThanOrEqual(16 * 16 * 2 * 1.1);
    for (const v of list) {
      expect(v.x).toBeGreaterThanOrEqual(40);
      expect(v.x).toBeLessThan(56);
      expect(v.z).toBeGreaterThanOrEqual(-60);
      expect(v.z).toBeLessThan(-44);
      expect(v.y).toBeCloseTo(terrainHeight(v.x, v.z));
    }
  });

  it('不會長在小路上，也遵守額外排除條件', () => {
    const list = scatterChunk(-16, -16, 32, { density: 2, seed: 1, accept: (x) => x < 0 });
    expect(list.length).toBeGreaterThan(0);
    for (const v of list) {
      expect(distanceToPath(v.x, v.z)).toBeGreaterThan(PATH_HALF_WIDTH * 0.85);
      expect(v.x).toBeLessThan(0);
    }
    expect(offPath(0, 0)).toBe(distanceToPath(0, 0) > PATH_HALF_WIDTH * 0.85);
  });

  it('花叢遮罩讓花成叢分布：部分區域有花、多數區域沒有', () => {
    let covered = 0;
    let total = 0;
    for (let x = -70; x <= 70; x += 2) {
      for (let z = -70; z <= 70; z += 2) {
        total++;
        if (flowerPatchMask(x, z) > 0.5) covered++;
      }
    }
    expect(covered / total).toBeGreaterThan(0.05);
    expect(covered / total).toBeLessThan(0.45);
  });

  it('畫質越低植被越少、距離越短；低畫質關閉後處理', () => {
    const { low, medium, high } = qualityPresets;
    expect(low.grassDensity).toBeLessThan(medium.grassDensity);
    expect(medium.grassDensity).toBeLessThan(high.grassDensity);
    expect(low.vegetationDistance).toBeLessThan(high.vegetationDistance);
    expect(low.postprocessing).toBe(false);
  });
});
