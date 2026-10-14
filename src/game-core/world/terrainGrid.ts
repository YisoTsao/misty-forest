// 地形取樣格（1 m 一點，整張地形 321 × 321）：地形網格、水面、世界地圖共用同一份取樣，
// terrainHeight 只算一次（任務 7A 地圖變大後，各自取樣會在載入時多花數百毫秒）。
import { distanceToPath, TERRAIN_SIZE, terrainHeight } from './terrain';

export type TerrainGrid = {
  /** 每邊的取樣點數（= 格數 + 1） */
  readonly size: number;
  /** 取樣間距（公尺） */
  readonly step: number;
  /** 高度，索引 j * size + i 對應 (x = -TERRAIN_SIZE/2 + i·step, z = -TERRAIN_SIZE/2 + j·step) */
  readonly height: Float32Array;
  /** 到最近道路中心的距離 */
  readonly pathDist: Float32Array;
};

let cached: TerrainGrid | null = null;

export function getTerrainGrid(): TerrainGrid {
  if (cached) return cached;
  const step = 1;
  const size = Math.round(TERRAIN_SIZE / step) + 1;
  const height = new Float32Array(size * size);
  const pathDist = new Float32Array(size * size);
  const half = TERRAIN_SIZE / 2;
  for (let j = 0; j < size; j++) {
    const z = -half + j * step;
    for (let i = 0; i < size; i++) {
      const x = -half + i * step;
      height[j * size + i] = terrainHeight(x, z);
      pathDist[j * size + i] = distanceToPath(x, z);
    }
  }
  cached = { size, step, height, pathDist };
  return cached;
}

/** 以雙線性內插取樣格上的值（超出範圍時取邊緣） */
export function sampleGrid(grid: TerrainGrid, field: Float32Array, x: number, z: number): number {
  const half = TERRAIN_SIZE / 2;
  const fx = Math.min(grid.size - 1.0001, Math.max(0, (x + half) / grid.step));
  const fz = Math.min(grid.size - 1.0001, Math.max(0, (z + half) / grid.step));
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
