// 地形取樣格（1 m 一點，每張地圖 321 × 321）：地形網格、水面、世界地圖共用同一份取樣，
// terrainHeight 只算一次（任務 7A 地圖變大後，各自取樣會在載入時多花數百毫秒）。
import { MAPS, type MapId } from './maps';
import { distanceToPath, terrainHeight } from './terrain';

export type TerrainGrid = {
  readonly map: MapId;
  /** 地圖原點（世界座標） */
  readonly originX: number;
  readonly originZ: number;
  /** 地形邊長（m） */
  readonly extent: number;
  /** 每邊的取樣點數（= 格數 + 1） */
  readonly size: number;
  /** 取樣間距（公尺） */
  readonly step: number;
  /** 高度，索引 j * size + i 對應 (x = origin.x - extent/2 + i·step, z = origin.z - extent/2 + j·step) */
  readonly height: Float32Array;
  /** 到最近道路中心的距離 */
  readonly pathDist: Float32Array;
};

const cached = new Map<MapId, TerrainGrid>();

export function getTerrainGrid(map: MapId = 'dawnvale'): TerrainGrid {
  const hit = cached.get(map);
  if (hit) return hit;
  const def = MAPS[map];
  const step = 1;
  const extent = def.size;
  const size = Math.round(extent / step) + 1;
  const height = new Float32Array(size * size);
  const pathDist = new Float32Array(size * size);
  const x0 = def.origin.x - extent / 2;
  const z0 = def.origin.z - extent / 2;
  for (let j = 0; j < size; j++) {
    const z = z0 + j * step;
    for (let i = 0; i < size; i++) {
      const x = x0 + i * step;
      height[j * size + i] = terrainHeight(x, z);
      pathDist[j * size + i] = distanceToPath(x, z);
    }
  }
  const grid: TerrainGrid = { map, originX: def.origin.x, originZ: def.origin.z, extent, size, step, height, pathDist };
  cached.set(map, grid);
  return grid;
}

/** 以雙線性內插取樣格上的值（世界座標；超出範圍時取邊緣） */
export function sampleGrid(grid: TerrainGrid, field: Float32Array, x: number, z: number): number {
  const half = grid.extent / 2;
  const fx = Math.min(grid.size - 1.0001, Math.max(0, (x - grid.originX + half) / grid.step));
  const fz = Math.min(grid.size - 1.0001, Math.max(0, (z - grid.originZ + half) / grid.step));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const a = field[j * grid.size + i]!;
  const b = field[j * grid.size + i + 1]!;
  const c = field[(j + 1) * grid.size + i]!;
  const d = field[(j + 1) * grid.size + i + 1]!;
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
