import { describe, expect, it } from 'vitest';
import placementsData from '@/data/placements.json';
import prefabsData from '@/data/prefabs.json';
import regionsData from '@/data/regions.json';
import { cellCenter, cellIndexAt, cellsToReveal, createExplored, decodeExplored, encodeExplored, EXPLORE_CELLS, exploredRatio, MAP_CELLS, mapCellOffset, withCells } from '../map/explore';
import { arrivalAt, isGateOpen } from './gates';
import {
  ANCIENT_ALTAR,
  CRYSTAL_GROTTO,
  GLOW_GARDEN,
  GLOWMOSS_ARRIVAL,
  GLOWMOSS_ORIGIN,
  glowmossHeight,
  glowmossPathDistance,
  LAKE_EXIT,
  MIST_ARCH,
  MUSHROOM_VILLAGE,
} from './glowmossTerrain';
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

  it('螢苔祕林的七個區域（任務 12B，Bible §6.3）：預設為螢苔花園，各區有範圍，迷霧依區域混合', () => {
    const at = (x: number, z: number) => regionAt(regions, G.x + x, G.z + z);
    expect(at(GLOWMOSS_ARRIVAL.x + 4, GLOWMOSS_ARRIVAL.z)).toBe('mist_gate');
    expect(at(MIST_ARCH.x, MIST_ARCH.z)).toBe('mist_gate');
    expect(at(GLOW_GARDEN.x, GLOW_GARDEN.z)).toBe('glow_garden');
    expect(at(-26, -100)).toBe('reverse_creek');
    expect(at(MUSHROOM_VILLAGE.x, MUSHROOM_VILLAGE.z)).toBe('mushroom_village');
    expect(at(52, 92)).toBe('deep_mist');
    expect(at(CRYSTAL_GROTTO.x, CRYSTAL_GROTTO.z)).toBe('crystal_grotto');
    expect(at(ANCIENT_ALTAR.x, ANCIENT_ALTAR.z)).toBe('ancient_altar');
    expect(at(LAKE_EXIT.x, LAKE_EXIT.z)).toBe('ancient_altar');
    expect(at(-120, -130)).toBe('glow_garden');
    expect(regionAt(regions, 0, 18)).toBe('meadow');
    // 入口濃霧（點亮星光燈柱後變淡）、花園淡霧
    expect(mistLevelAt(regions, initialMistStages, G.x + MIST_ARCH.x, G.z + MIST_ARCH.z)).toBeCloseTo(1);
    expect(mistLevelAt(regions, initialMistStages, G.x + GLOW_GARDEN.x, G.z + GLOW_GARDEN.z)).toBeCloseTo(0.5);
  });
});

describe('螢苔祕林地形', () => {
  it('入口、石拱門、花園、聚落、祭壇是平坦的平台', () => {
    for (const p of [GLOWMOSS_ARRIVAL, MIST_ARCH, GLOW_GARDEN, MUSHROOM_VILLAGE, ANCIENT_ALTAR]) {
      const h = glowmossHeight(p.x, p.z);
      expect(Math.abs(glowmossHeight(p.x + 3, p.z) - h)).toBeLessThan(0.4);
      expect(Math.abs(glowmossHeight(p.x, p.z + 3) - h)).toBeLessThan(0.4);
    }
  });

  it('聚落、祭壇、祕窟外圍是山脊；小徑經過的地方是開口，祕窟沒有開口', () => {
    const ridge = (c: { x: number; z: number; radius: number }, gap: number, angle: number) =>
      glowmossHeight(c.x + Math.cos(angle) * (c.radius + gap), c.z + Math.sin(angle) * (c.radius + gap)) - glowmossHeight(c.x, c.z);
    // 聚落：東、西是山脊，北面（溪谷過來）是開口
    expect(ridge(MUSHROOM_VILLAGE, 7, 0)).toBeGreaterThan(3);
    expect(ridge(MUSHROOM_VILLAGE, 7, Math.PI)).toBeGreaterThan(3);
    expect(ridge(MUSHROOM_VILLAGE, 7, -Math.PI / 2)).toBeLessThan(1.5);
    // 祭壇：東側是山脊
    expect(ridge(ANCIENT_ALTAR, 7, 0)).toBeGreaterThan(3);
    // 祕窟：四面都是山脊
    for (let k = 0; k < 8; k++) expect(ridge(CRYSTAL_GROTTO, 6, (k / 8) * Math.PI * 2), `角度 ${k}`).toBeGreaterThan(3);
    expect(glowmossPathDistance(CRYSTAL_GROTTO.x, CRYSTAL_GROTTO.z)).toBeGreaterThan(CRYSTAL_GROTTO.radius + 10);
  });

  it('沒有低於水面的地方（溪谷還沒有水，不會落水）', () => {
    const grid = getTerrainGrid('glowmoss');
    let min = Infinity;
    for (const h of grid.height) min = Math.min(min, h);
    // 共用水位 + 0.3 以下會被當成水邊（不長草、不記錄安全點、不生成怪物）
    expect(min).toBeGreaterThan(WATER_LEVEL + 0.3);
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
    expect(EXPLORE_CELLS).toBe(MAP_CELLS * 4);
    expect(cellIndexAt(4000, 0)! - mapCellOffset('mirrorlake')).toBe(cellIndexAt(0, 0));
    expect(cellIndexAt(6000, 0)! - mapCellOffset('whispermeadow')).toBe(cellIndexAt(0, 0));
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

  it('相鄰地圖之間各有一對出入口，抵達點在目的地圖的可玩區內、離出入口與邊界都夠遠', () => {
    expect(gates.map((g) => prefabs.get(g.prefabId)!.enter!.to).sort()).toEqual(['dawnvale', 'glowmoss', 'glowmoss', 'mirrorlake', 'mirrorlake', 'whispermeadow']);
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

  it('通往澄鏡湖：過渡期間只要求第一章完成（任務 12A，T-187；第二章做到 quest_forest_008 後改回 T-186）', () => {
    const enter = prefabs.get('gate_to_mirrorlake')!.enter!;
    expect(isGateOpen(enter, {})).toBe(false);
    expect(isGateOpen(enter, { quest_dawn_003: { status: 'completed' } })).toBe(true);
    expect(isGateOpen(prefabs.get('gate_to_glowmoss_lake')!.enter!, {})).toBe(true);
  });

  it('通往風語草原要先喚醒潮之共鳴（任務 9F）', () => {
    const enter = prefabs.get('gate_to_meadow')!.enter!;
    expect(isGateOpen(enter, { quest_lake_002: { status: 'completed' } })).toBe(false);
    expect(isGateOpen(enter, { quest_lake_003: { status: 'active' } })).toBe(false);
    expect(isGateOpen(enter, { quest_lake_003: { status: 'completed' } })).toBe(true);
    expect(isGateOpen(prefabs.get('gate_to_mirrorlake_sail')!.enter!, {})).toBe(true);
  });

  it('通往螢苔祕林要先點亮燈塔（T-144）', () => {
    const enter = prefabs.get('gate_to_glowmoss')!.enter!;
    expect(isGateOpen(enter, {})).toBe(false);
    expect(isGateOpen(enter, { repair_bridge: { status: 'completed' } })).toBe(false);
    expect(isGateOpen(enter, { quest_dawn_003: { status: 'active' } })).toBe(false);
    expect(isGateOpen(enter, { quest_dawn_003: { status: 'completed' } })).toBe(true);
    expect(isGateOpen(prefabs.get('gate_to_dawnvale')!.enter!, {})).toBe(true);
  });

  it('澄鏡湖的 placement 都在地形範圍內，且標記的區域與位置一致（任務 9A）', () => {
    const lake = placements.filter((p) => mapIdAt(p.position[0], p.position[2]) === 'mirrorlake');
    expect(lake.length).toBeGreaterThan(1000);
    for (const p of lake) {
      expect(isOnMapTerrain(MAPS.mirrorlake, p.position[0], p.position[2]), p.id).toBe(true);
      if (!p.id.startsWith('mirrorlake_edge_tree')) expect(regionAt(regions, p.position[0], p.position[2]), p.id).toBe(p.regionId);
    }
  });

  it('風語草原的 placement 都在地形範圍內，且標記的區域與位置一致（任務 9F）', () => {
    const meadow = placements.filter((p) => mapIdAt(p.position[0], p.position[2]) === 'whispermeadow');
    expect(meadow.length).toBeGreaterThan(1000);
    for (const p of meadow) {
      expect(isOnMapTerrain(MAPS.whispermeadow, p.position[0], p.position[2]), p.id).toBe(true);
      if (!p.id.startsWith('wm_edge_tree')) expect(regionAt(regions, p.position[0], p.position[2]), p.id).toBe(p.regionId);
    }
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
