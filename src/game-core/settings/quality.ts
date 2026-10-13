// 畫質三級（規格 4.4）：低畫質關閉後處理並降低植被密度。數值在 Phase 1 實機量測後校正（見 docs/PERF.md）。

export const qualityLevels = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof qualityLevels)[number];

export type QualityPreset = {
  /** 草叢密度（每平方公尺） */
  grassDensity: number;
  /** 花朵密度（每平方公尺，只在花叢區域內） */
  flowerDensity: number;
  /** 草花可見距離（公尺），超過後縮入地面 */
  vegetationDistance: number;
  /** 後處理（Bloom、調色、暗角） */
  postprocessing: boolean;
  /** 主光陰影貼圖解析度 */
  shadowMapSize: number;
  /** 最大像素比 */
  maxDpr: number;
  /** 同時存在的特效粒子上限（螢火蟲、魔法；GAME_DESIGN 6.2） */
  particleBudget: number;
};

export const qualityPresets: Record<QualityLevel, QualityPreset> = {
  low: { grassDensity: 0.6, flowerDensity: 0.5, vegetationDistance: 28, postprocessing: false, shadowMapSize: 1024, maxDpr: 1, particleBudget: 800 },
  medium: { grassDensity: 1.4, flowerDensity: 0.9, vegetationDistance: 42, postprocessing: true, shadowMapSize: 2048, maxDpr: 1.5, particleBudget: 2000 },
  high: { grassDensity: 2.4, flowerDensity: 1.4, vegetationDistance: 55, postprocessing: true, shadowMapSize: 2048, maxDpr: 2, particleBudget: 3000 },
};

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (qualityLevels as readonly string[]).includes(value);
}
