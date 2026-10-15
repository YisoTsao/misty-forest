// 地圖（Bible §3、GAME_DESIGN §2.2；任務 8A）：所有地圖放在同一個物理世界的不同位置（決策 T-117），
// 地形、邊界、區域、探索紀錄都依世界座標判斷所在地圖。玩家位置本來就存檔，讀檔後自然回到原本的地圖。
import { boundaryDistance, clampInsideBounds, type PlayBounds } from './bounds';
import { GLOWMOSS_ARRIVAL, GLOWMOSS_ORIGIN, GLOWMOSS_SIZE, isInGlowmoss } from './glowmossTerrain.ts';
import { isInMeadow, MEADOW_ARRIVAL, MEADOW_ORIGIN, MEADOW_SIZE } from './meadowTerrain.ts';
import { isInMirrorlake, MIRRORLAKE_ARRIVAL, MIRRORLAKE_ORIGIN, MIRRORLAKE_SIZE } from './mirrorlakeTerrain.ts';
import { SPAWN_POINT, TERRAIN_SIZE } from './terrain';
import type { RegionId } from './types';

export const mapIds = ['dawnvale', 'glowmoss', 'mirrorlake', 'whispermeadow'] as const;
export type MapId = (typeof mapIds)[number];

export type MapDef = {
  id: MapId;
  nameKey: string;
  /** 地圖原點（世界座標）：地形、邊界都以此為中心 */
  origin: { x: number; z: number };
  /** 地形邊長（m） */
  size: number;
  /** 可玩區（以原點為中心的圓角方形） */
  bounds: PlayBounds;
  /** 沒有落在任何區域範圍內時所屬的區域 */
  defaultRegion: RegionId;
  /** 掉落且沒有安全點時、以及倒下後回到的位置（世界座標） */
  respawn: { x: number; z: number };
};

const PLAY_BOUNDS_148: PlayBounds = { halfExtent: 148, cornerRadius: 18 };

export const MAPS: Readonly<Record<MapId, MapDef>> = {
  dawnvale: {
    id: 'dawnvale',
    nameKey: 'map.dawnvale',
    origin: { x: 0, z: 0 },
    size: TERRAIN_SIZE,
    bounds: PLAY_BOUNDS_148,
    defaultRegion: 'meadow',
    // 倒下後回到村子路口
    respawn: { x: -8, z: -18 },
  },
  glowmoss: {
    id: 'glowmoss',
    nameKey: 'map.glowmoss',
    origin: { ...GLOWMOSS_ORIGIN },
    size: GLOWMOSS_SIZE,
    bounds: PLAY_BOUNDS_148,
    defaultRegion: 'moss_glade',
    respawn: { x: GLOWMOSS_ORIGIN.x + GLOWMOSS_ARRIVAL.x + 4, z: GLOWMOSS_ORIGIN.z + GLOWMOSS_ARRIVAL.z },
  },
  // 澄鏡湖（任務 9A，Bible §7）
  mirrorlake: {
    id: 'mirrorlake',
    nameKey: 'map.mirrorlake',
    origin: { ...MIRRORLAKE_ORIGIN },
    size: MIRRORLAKE_SIZE,
    bounds: PLAY_BOUNDS_148,
    defaultRegion: 'lake_shore',
    respawn: { x: MIRRORLAKE_ORIGIN.x + MIRRORLAKE_ARRIVAL.x, z: MIRRORLAKE_ORIGIN.z + MIRRORLAKE_ARRIVAL.z + 4 },
  },
  // 風語草原（任務 9F，Bible §8）
  whispermeadow: {
    id: 'whispermeadow',
    nameKey: 'map.whispermeadow',
    origin: { ...MEADOW_ORIGIN },
    size: MEADOW_SIZE,
    bounds: PLAY_BOUNDS_148,
    defaultRegion: 'windy_hills',
    respawn: { x: MEADOW_ORIGIN.x + MEADOW_ARRIVAL.x + 4, z: MEADOW_ORIGIN.z + MEADOW_ARRIVAL.z },
  },
};

export function isMapId(id: string): id is MapId {
  return (mapIds as readonly string[]).includes(id);
}

/** 新遊戲的出生點（晨曦谷地） */
export const NEW_GAME_SPAWN = { x: SPAWN_POINT.x, z: SPAWN_POINT.z } as const;

/** 世界座標所在的地圖（室內子場景屬於晨曦谷地：酒館在晨曦村） */
export function mapIdAt(x: number, z: number): MapId {
  if (isInGlowmoss(x, z)) return 'glowmoss';
  if (isInMirrorlake(x, z)) return 'mirrorlake';
  if (isInMeadow(x, z)) return 'whispermeadow';
  return 'dawnvale';
}

export function mapAt(x: number, z: number): MapDef {
  return MAPS[mapIdAt(x, z)];
}

/** 世界座標 → 該地圖的局部座標 */
export function toLocal(map: MapDef, x: number, z: number): { x: number; z: number } {
  return { x: x - map.origin.x, z: z - map.origin.z };
}

/** 是否在這張地圖的地形範圍內（世界座標） */
export function isOnMapTerrain(map: MapDef, x: number, z: number): boolean {
  return Math.abs(x - map.origin.x) <= map.size / 2 && Math.abs(z - map.origin.z) <= map.size / 2;
}

/** 到所在地圖邊界的有號距離（界內為正，世界座標） */
export function worldBoundaryDistance(x: number, z: number): number {
  const map = mapAt(x, z);
  return boundaryDistance(x - map.origin.x, z - map.origin.z, map.bounds);
}

/** 把位置拉回所在地圖的可玩區內（世界座標） */
export function clampInsideMap(x: number, z: number, margin = 0): { x: number; z: number } {
  const map = mapAt(x, z);
  const p = clampInsideBounds(x - map.origin.x, z - map.origin.z, margin, map.bounds);
  return { x: p.x + map.origin.x, z: p.z + map.origin.z };
}
