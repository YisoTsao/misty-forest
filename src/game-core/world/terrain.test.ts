import { describe, expect, it } from 'vitest';
import {
  BRANCH_ROADS,
  distanceToPath,
  distanceToRiver,
  LAKE,
  MAIN_ROAD_NORTH,
  pathCenterX,
  RIVER_BRIDGE,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_PATH,
  SPAWN_POINT,
  TERRAIN_SIZE,
  terrainHeight,
  VILLAGE_CENTER,
  WATER_LEVEL,
} from './terrain';

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

  it('只有湖與溪低於水面（草原上沒有積水的窪地）', () => {
    for (let x = -150; x <= 150; x += 3) {
      for (let z = -150; z <= 150; z += 3) {
        if (terrainHeight(x, z) >= WATER_LEVEL + 0.3) continue;
        const inLake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + 1;
        const inRiver = distanceToRiver(x, z) < RIVER_HALF_WIDTH + 6;
        expect(inLake || inRiver, `(${x}, ${z})`).toBe(true);
      }
    }
  });

  it('溪流：河道中央低於水面且夠深會落水，淺灘可涉水，溪橋兩端與橋面同高', () => {
    expect(terrainHeight(RIVER_PATH[5]![0], RIVER_PATH[5]![1] + 12)).toBeLessThan(WATER_LEVEL - 1.5);
    for (const f of RIVER_FORDS) {
      const h = terrainHeight(f.x, f.z);
      expect(h).toBeLessThan(WATER_LEVEL);
      expect(h).toBeGreaterThan(WATER_LEVEL - 0.5);
    }
    for (const side of [-1, 1]) {
      const h = terrainHeight(RIVER_BRIDGE.x + side * (RIVER_BRIDGE.length / 2 + 1.5), RIVER_BRIDGE.z);
      expect(h).toBeCloseTo(RIVER_BRIDGE.deckY - 0.08, 1);
    }
  });

  it('北方高地比低地高約 10 m，主路是可以走上去的緩坡（坡度小於 50°）', () => {
    expect(terrainHeight(-60, -130) - terrainHeight(-60, -60)).toBeGreaterThan(7);
    let prev = terrainHeight(pathCenterX(-70), -70);
    for (let z = -70; z >= MAIN_ROAD_NORTH; z -= 0.5) {
      const h = terrainHeight(pathCenterX(z), z);
      expect(Math.abs(h - prev) / 0.5).toBeLessThan(Math.tan((50 * Math.PI) / 180));
      prev = h;
    }
  });

  it('道路網：支線的距離為 0 附近、遠處距離大', () => {
    for (const road of BRANCH_ROADS) for (const [x, z] of road) expect(distanceToPath(x, z)).toBeLessThan(0.01);
    expect(distanceToPath(-130, 130)).toBeGreaterThan(20);
  });

  it('結果為有限數值', () => {
    for (let x = -160; x <= 160; x += 7) {
      for (let z = -160; z <= 160; z += 7) expect(Number.isFinite(terrainHeight(x, z))).toBe(true);
    }
  });
});

describe('getTerrainGrid', () => {
  it('取樣格與 terrainHeight / distanceToPath 一致，內插在兩點之間', async () => {
    const { getTerrainGrid, sampleGrid } = await import('./terrainGrid');
    const grid = getTerrainGrid();
    expect(grid.size).toBe(TERRAIN_SIZE + 1);
    for (const [x, z] of [[0, 18], [-86, -28], [100, -1], [-34, -126]] as const) {
      expect(sampleGrid(grid, grid.height, x, z)).toBeCloseTo(terrainHeight(x, z), 4);
      expect(sampleGrid(grid, grid.pathDist, x, z)).toBeCloseTo(distanceToPath(x, z), 4);
    }
    const mid = sampleGrid(grid, grid.height, 10.5, 3);
    const lo = Math.min(terrainHeight(10, 3), terrainHeight(11, 3));
    const hi = Math.max(terrainHeight(10, 3), terrainHeight(11, 3));
    expect(mid).toBeGreaterThanOrEqual(lo - 1e-4);
    expect(mid).toBeLessThanOrEqual(hi + 1e-4);
  });
});
