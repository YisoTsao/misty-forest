import { describe, expect, it } from 'vitest';
import placementsData from '@/data/placements.json';
import prefabsData from '@/data/prefabs.json';
import regionsData from '@/data/regions.json';
import { cellCenter, cellIndexAt, cellsToReveal, createExplored, decodeExplored, encodeExplored, EXPLORE_CELLS, exploredRatio, MAP_CELLS, mapCellOffset, withCells } from '../map/explore';
import { arrivalAt, isGateOpen } from './gates';
import { CHANNEL_CROSSINGS, CHANNEL_WATER_LEVEL, GLOWMOSS_ARRIVAL, GLOWMOSS_ORIGIN, glowmossHeight, MOSS_CROWN, STONE_RING } from './glowmossTerrain';
import { clampInsideMap, isOnMapTerrain, MAPS, mapIdAt, worldBoundaryDistance } from './maps';
import { mistLevelAt, parseRegions, regionAt, initialMistStages } from './regions';
import { isInsidePlayArea, defaultSafePointOptions } from './safePoints';
import { distanceToPath, TERRAIN_SIZE, terrainHeight, WATER_LEVEL } from './terrain';
import { getTerrainGrid, sampleGrid } from './terrainGrid';
import type { Placement, Prefab } from './types';

const G = GLOWMOSS_ORIGIN;
const regions = parseRegions(regionsData);
const placements = placementsData as Placement[];
const prefabs = new Map((prefabsData as Prefab[]).map((p) => [p.id, p]));

describe('地圖（任務 8A）', () => {
  it('依世界座標判斷所在地圖；室內子場景屬於晨曦谷地', () => {
    expect(mapIdAt(0, 18)).toBe('dawnvale');
    expect(mapIdAt(1000, 1000)).toBe('dawnvale');
    expect(mapIdAt(G.x, G.z)).toBe('glowmoss');
    expect(mapIdAt(G.x - 160, G.z + 160)).toBe('glowmoss');
    expect(MAPS.glowmoss.size).toBe(TERRAIN_SIZE);
  });

  it('terrainHeight 依地圖分派到各自的地形', () => {
    expect(terrainHeight(G.x + 12, G.z - 40)).toBeCloseTo(glowmossHeight(12, -40));
    expect(terrainHeight(0, 18)).toBeCloseTo(0);
  });

  it('邊界距離與夾住以所在地圖的原點計算', () => {
    expect(worldBoundaryDistance(G.x, G.z)).toBeCloseTo(148);
    expect(worldBoundaryDistance(G.x + 150, G.z)).toBeLessThan(0);
    const c = clampInsideMap(G.x + 200, G.z, 2);
    expect(c.x).toBeCloseTo(G.x + 146);
    expect(isInsidePlayArea(G.x + 100, G.z - 100, defaultSafePointOptions)).toBe(true);
  });

  it('取樣格以地圖原點為中心，與 terrainHeight 一致', () => {
    const grid = getTerrainGrid('glowmoss');
    expect(grid.originX).toBe(G.x);
    for (const [x, z] of [
      [G.x + 10.5, G.z - 33.2],
      [G.x - 120, G.z + 80],
    ] as const) {
      expect(sampleGrid(grid, grid.height, x, z)).toBeCloseTo(terrainHeight(x, z), 1);
      expect(sampleGrid(grid, grid.pathDist, x, z)).toBeCloseTo(distanceToPath(x, z), 0);
    }
  });

  it('螢苔祕林的區域：預設為螢苔林地，各區有範圍，迷霧依區域混合', () => {
    expect(regionAt(regions, G.x + GLOWMOSS_ARRIVAL.x + 4, G.z + GLOWMOSS_ARRIVAL.z)).toBe('moss_trail');
    expect(regionAt(regions, G.x + MOSS_CROWN.x, G.z + MOSS_CROWN.z)).toBe('moss_crown');
    expect(regionAt(regions, G.x + 76, G.z - 74)).toBe('root_maze');
    expect(regionAt(regions, G.x + 130, G.z + 130)).toBe('moss_glade');
    expect(regionAt(regions, 0, 18)).toBe('meadow');
    expect(mistLevelAt(regions, initialMistStages, G.x + MOSS_CROWN.x, G.z + MOSS_CROWN.z)).toBeCloseTo(1);
  });
});

describe('螢苔祕林地形', () => {
  it('入口、石環、苔冠空地是平坦的平台', () => {
    for (const p of [GLOWMOSS_ARRIVAL, STONE_RING, MOSS_CROWN]) {
      const h = glowmossHeight(p.x, p.z);
      expect(Math.abs(glowmossHeight(p.x + 3, p.z) - h)).toBeLessThan(0.4);
      expect(Math.abs(glowmossHeight(p.x, p.z + 3) - h)).toBeLessThan(0.4);
    }
  });

  it('苔冠空地外圍是山脊，只有西側開口', () => {
    const inside = glowmossHeight(MOSS_CROWN.x, MOSS_CROWN.z);
    const r = MOSS_CROWN.radius + 9;
    expect(glowmossHeight(MOSS_CROWN.x, MOSS_CROWN.z - r) - inside).toBeGreaterThan(4);
    expect(glowmossHeight(MOSS_CROWN.x + r, MOSS_CROWN.z) - inside).toBeGreaterThan(4);
    expect(Math.abs(glowmossHeight(MOSS_CROWN.x - r, MOSS_CROWN.z) - inside)).toBeLessThan(2.5);
  });

  it('沒有低於水面的地方（渠道乾涸，不會落水）；渠道跨越處墊高', () => {
    const grid = getTerrainGrid('glowmoss');
    let min = Infinity;
    for (const h of grid.height) min = Math.min(min, h);
    expect(min).toBeGreaterThan(WATER_LEVEL - 0.6);
    for (const c of CHANNEL_CROSSINGS) expect(glowmossHeight(c.x, c.z)).toBeGreaterThan(CHANNEL_WATER_LEVEL - 0.2);
  });

  it('小徑沿線的坡度可以走（< 45°）', () => {
    const grid = getTerrainGrid('glowmoss');
    let worst = 0;
    for (let lz = -140; lz <= 140; lz += 2) {
      for (let lx = -140; lx <= 140; lx += 2) {
        const x = G.x + lx;
        const z = G.z + lz;
        if (sampleGrid(grid, grid.pathDist, x, z) > 1.2) continue;
        const slope = Math.hypot(terrainHeight(x + 0.5, z) - terrainHeight(x - 0.5, z), terrainHeight(x, z + 0.5) - terrainHeight(x, z - 0.5));
        worst = Math.max(worst, slope);
      }
    }
    expect(worst).toBeLessThan(1);
  });
});

describe('地圖的探索紀錄', () => {
  it('每張地圖各一段格子；格子中心換算回同一張地圖', () => {
    expect(EXPLORE_CELLS).toBe(MAP_CELLS * 2);
    const a = cellIndexAt(0, 0)!;
    const b = cellIndexAt(G.x, G.z)!;
    expect(a).toBeLessThan(MAP_CELLS);
    expect(b - mapCellOffset('glowmoss')).toBe(a);
    const c = cellCenter(b);
    expect(mapIdAt(c.x, c.z)).toBe('glowmoss');
    expect(Math.hypot(c.x - G.x, c.z - G.z)).toBeLessThan(8);
  });

  it('在螢苔祕林揭開的格子只算在螢苔祕林', () => {
    const bits = withCells(createExplored(), cellsToReveal(createExplored(), G.x, G.z));
    expect(exploredRatio(bits, 'glowmoss')).toBeGreaterThan(0);
    expect(exploredRatio(bits, 'dawnvale')).toBe(0);
  });

  it('只有一張地圖的舊紀錄讀回時補上空白；長度不是整數張地圖時拒絕', () => {
    const old = new Uint8Array(MAP_CELLS / 8).fill(255);
    const decoded = decodeExplored(encodeExplored(old))!;
    expect(decoded.length).toBe(EXPLORE_CELLS / 8);
    expect(exploredRatio(decoded, 'dawnvale')).toBe(1);
    expect(exploredRatio(decoded, 'glowmoss')).toBe(0);
    expect(decodeExplored(encodeExplored(new Uint8Array(7)))).toBeNull();
  });
});

describe('地圖出入口', () => {
  const gates = placements.filter((p) => prefabs.get(p.prefabId)?.enter?.arriveAt);

  it('兩張地圖之間各有一個出入口，抵達點在目的地圖的可玩區內、離出入口與邊界都夠遠', () => {
    expect(gates.map((g) => prefabs.get(g.prefabId)!.enter!.to).sort()).toEqual(['dawnvale', 'glowmoss']);
    for (const gate of gates) {
      const enter = prefabs.get(gate.prefabId)!.enter!;
      const target = placements.find((p) => p.id === enter.arriveAt)!;
      expect(mapIdAt(target.position[0], target.position[2])).toBe(enter.to);
      const to = arrivalAt(target, enter.arriveDistance ?? 4);
      expect(mapIdAt(to.x, to.z)).toBe(enter.to);
      expect(isOnMapTerrain(MAPS[enter.to as 'glowmoss'], to.x, to.z)).toBe(true);
      expect(worldBoundaryDistance(to.x, to.z)).toBeGreaterThan(6);
      // 抵達後面向離開出入口的方向，不會一抵達就又站在出入口的互動範圍內
      expect(Math.hypot(to.x - target.position[0], to.z - target.position[2])).toBeGreaterThan(prefabs.get(target.prefabId)!.interactRadius ?? 2);
    }
  });

  it('通往螢苔祕林要先修好木橋', () => {
    const enter = prefabs.get('gate_to_glowmoss')!.enter!;
    expect(isGateOpen(enter, {})).toBe(false);
    expect(isGateOpen(enter, { repair_bridge: { status: 'active' } })).toBe(false);
    expect(isGateOpen(enter, { repair_bridge: { status: 'completed' } })).toBe(true);
    expect(isGateOpen(prefabs.get('gate_to_dawnvale')!.enter!, {})).toBe(true);
  });

  it('螢苔祕林的 placement 都在地形範圍內，且標記的區域與位置一致', () => {
    const forest = placements.filter((p) => mapIdAt(p.position[0], p.position[2]) === 'glowmoss');
    expect(forest.length).toBeGreaterThan(1500);
    for (const p of forest) {
      expect(isOnMapTerrain(MAPS.glowmoss, p.position[0], p.position[2]), p.id).toBe(true);
      if (!p.id.startsWith('glowmoss_edge_tree')) expect(regionAt(regions, p.position[0], p.position[2]), p.id).toBe(p.regionId);
    }
  });
});
