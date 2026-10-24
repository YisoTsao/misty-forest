// 迷霧暴走的紫霧區（第二章 B-01 第二階段，規格 §6.4）：頭目血量跌破 phase2Below 之後（含淨化中），
// 戰場地面出現幾塊紫色迷霧，站在裡面會持續受傷；點亮的共鳴石柱會驅散 safeRadius 內的紫霧（安全區）。
import { z } from 'zod';

const point = z.tuple([z.number(), z.number()]);

export const bossMistSchema = z.object({
  /** 每塊紫霧的半徑 */
  radius: z.number().positive(),
  /** 每次扣血 */
  damage: z.number().positive(),
  /** 站在紫霧裡每隔幾秒扣一次血 */
  interval: z.number().positive(),
  /** 點亮的共鳴石柱驅散多遠內的紫霧（以紫霧中心到石柱的距離判斷） */
  safeRadius: z.number().positive(),
  /** 紫霧的中心 */
  spots: z.array(point).min(1),
});
export type BossMist = z.infer<typeof bossMistSchema>;

/** 這一刻紫霧是否出現：第二階段或淨化中 */
export function bossMistRising(boss: { phase2Below: number }, hpRatio: number, purifying: boolean): boolean {
  return purifying || hpRatio < boss.phase2Below;
}

/** 還沒被石柱驅散的紫霧（litPillars：已點亮的石柱位置） */
export function activeMistSpots(mist: BossMist, litPillars: readonly (readonly [number, number])[]): [number, number][] {
  return mist.spots.filter(([x, z]) => !litPillars.some(([px, pz]) => Math.hypot(x - px, z - pz) <= mist.safeRadius));
}

/** 這個位置是否在紫霧裡 */
export function inBossMist(mist: BossMist, litPillars: readonly (readonly [number, number])[], x: number, z: number): boolean {
  return activeMistSpots(mist, litPillars).some(([sx, sz]) => Math.hypot(x - sx, z - sz) <= mist.radius);
}
