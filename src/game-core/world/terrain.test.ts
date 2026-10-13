import { describe, expect, it } from 'vitest';
import { SPAWN_POINT, TERRAIN_SIZE, terrainHeight, VILLAGE_CENTER } from './terrain';

describe('terrainHeight', () => {
  it('出生點周圍是平地', () => {
    const h0 = terrainHeight(SPAWN_POINT.x, SPAWN_POINT.z);
    const h1 = terrainHeight(SPAWN_POINT.x + 3, SPAWN_POINT.z - 3);
    expect(Math.abs(h1 - h0)).toBeLessThan(0.3);
  });

  it('村莊範圍內是平地（小路下凹除外）', () => {
    const { x, z } = VILLAGE_CENTER;
    for (const [dx, dz] of [[-8, -6], [7, 5], [-10, 8], [9, -9]] as const) {
      expect(Math.abs(terrainHeight(x + dx, z + dz))).toBeLessThan(0.05);
    }
  });

  it('地圖邊緣比中央高（自然邊界）', () => {
    const edge = TERRAIN_SIZE / 2 - 1;
    expect(terrainHeight(edge, 0)).toBeGreaterThan(terrainHeight(0, 0) + 4);
  });

  it('結果為有限數值', () => {
    for (let x = -80; x <= 80; x += 7) {
      for (let z = -80; z <= 80; z += 7) expect(Number.isFinite(terrainHeight(x, z))).toBe(true);
    }
  });
});
