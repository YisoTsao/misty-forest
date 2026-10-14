// 草與花的散佈（規格 4.3）：純函式，依區塊（chunk）以固定種子產生，結果可重現。
// 只決定「放在哪裡」；外觀與風動由渲染層負責。
import { hash2, mulberry32, valueNoise } from '../util/random';
import { distanceToPath, PATH_HALF_WIDTH, terrainHeight } from './terrain';

export type VegetationInstance = { x: number; y: number; z: number; yaw: number; scale: number; variant: number };

export type ScatterOptions = {
  /** 每平方公尺數量 */
  density: number;
  seed: number;
  /** 額外排除條件（例如建築、樹幹位置），回傳 false 表示不放 */
  accept?: (x: number, z: number) => boolean;
  /** 0–1 的分布遮罩（例如花叢只出現在雜訊高的區域）；省略時處處可放 */
  mask?: (x: number, z: number) => number;
  /** 外觀變化數量（花色等），variant 介於 0 與 variants - 1 */
  variants?: number;
  scale?: [number, number];
  /** 取樣函式（省略時用 terrainHeight / distanceToPath）；渲染層傳入共用取樣格的內插，載入時快很多 */
  heightAt?: (x: number, z: number) => number;
  pathDistAt?: (x: number, z: number) => number;
};

/** 小路上不長草花（留一點邊緣讓路緣自然） */
export function offPath(x: number, z: number): boolean {
  return distanceToPath(x, z) > PATH_HALF_WIDTH * 0.85;
}

/**
 * 在 [x0, x0 + size) × [z0, z0 + size) 內以抖動格點散佈：分布均勻、沒有明顯的格線感。
 * 同一區塊與種子永遠得到相同結果。
 */
export function scatterChunk(x0: number, z0: number, size: number, opts: ScatterOptions): VegetationInstance[] {
  const out: VegetationInstance[] = [];
  if (!(opts.density > 0)) return out;
  const step = 1 / Math.sqrt(opts.density);
  const n = Math.max(1, Math.round(size / step));
  const cell = size / n;
  const rand = mulberry32(Math.floor(hash2(Math.round(x0), Math.round(z0), opts.seed) * 2 ** 31));
  const [s0, s1] = opts.scale ?? [0.8, 1.2];
  const variants = opts.variants ?? 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = x0 + (i + rand()) * cell;
      const z = z0 + (j + rand()) * cell;
      const yaw = rand() * Math.PI * 2;
      const scale = s0 + rand() * (s1 - s0);
      const variant = Math.floor(rand() * variants);
      const keep = rand();
      if (opts.mask && keep > opts.mask(x, z)) continue;
      if ((opts.pathDistAt ? opts.pathDistAt(x, z) : distanceToPath(x, z)) <= PATH_HALF_WIDTH * 0.85) continue;
      if (opts.accept && !opts.accept(x, z)) continue;
      out.push({ x, y: opts.heightAt ? opts.heightAt(x, z) : terrainHeight(x, z), z, yaw, scale, variant });
    }
  }
  return out;
}

/** 花叢遮罩：大片區域無花，少數區域成叢盛開 */
export function flowerPatchMask(x: number, z: number): number {
  const n = valueNoise(x * 0.07, z * 0.07, 7) * 0.7 + valueNoise(x * 0.21, z * 0.21, 11) * 0.3;
  return Math.min(1, Math.max(0, (n - 0.55) / 0.15));
}
