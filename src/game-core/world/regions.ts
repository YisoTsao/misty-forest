// 區域（規格 5.1）與各區域的迷霧（規格 1.4、4.5；R-03）。
// 權威狀態只存每區三段（濃 / 淡 / 清），畫面上的 mistLevel 由玩家所在位置在區域之間平滑混合。
import { z } from 'zod';
import { mistLevelOf, mistStages, type MistStage } from './mist';
import { regionIds, type RegionId } from './types';

/** 沒有落在任何區域範圍內時所屬的區域（開闊的草原） */
export const DEFAULT_REGION: RegionId = 'meadow';

export const regionDefSchema = z.object({
  id: z.enum(regionIds),
  nameKey: z.string().min(1),
  /** 圓形範圍；省略表示這個區域還沒有實際場地（例如之後才加入的區域） */
  area: z
    .object({
      center: z.tuple([z.number(), z.number()]),
      radius: z.number().positive(),
      /** 邊界兩側的混合寬度（公尺），迷霧在這段距離內漸變 */
      blend: z.number().positive(),
    })
    .optional(),
});
export type RegionDef = z.infer<typeof regionDefSchema>;
export type MistStages = Readonly<Record<RegionId, MistStage>>;

export const mistStagesSchema = z.object(
  Object.fromEntries(regionIds.map((id) => [id, z.enum(mistStages)])) as Record<RegionId, z.ZodEnum<{ [K in MistStage]: K }>>,
);

/** 新遊戲的迷霧：出生草原晴朗，村莊與湖泊淡霧，森林與遺跡濃霧（第一章要逐步驅散） */
export const initialMistStages: MistStages = {
  meadow: 'clear',
  village: 'light',
  forest: 'dense',
  lake: 'light',
  home: 'clear',
  overlook: 'light',
  ruins: 'dense',
};

export function parseRegions(raw: unknown): RegionDef[] {
  const list = z.array(regionDefSchema).parse(raw);
  const seen = new Set<RegionId>();
  for (const r of list) {
    if (seen.has(r.id)) throw new Error(`區域重複：${r.id}`);
    seen.add(r.id);
  }
  return list;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 區域在 (x, z) 的權重：中心區為 1，邊界 ± blend/2 內平滑降到 0 */
function weightAt(region: RegionDef, x: number, z: number): number {
  if (!region.area) return 0;
  const { center, radius, blend } = region.area;
  const d = Math.hypot(x - center[0], z - center[1]);
  return 1 - smoothstep(radius - blend / 2, radius + blend / 2, d);
}

/** (x, z) 所屬的區域（權重最大者；都不在範圍內則為預設區域） */
export function regionAt(regions: readonly RegionDef[], x: number, z: number): RegionId {
  let best: RegionId = DEFAULT_REGION;
  let bestWeight = 0.5;
  for (const r of regions) {
    const w = weightAt(r, x, z);
    if (w > bestWeight) {
      best = r.id;
      bestWeight = w;
    }
  }
  return best;
}

/** (x, z) 的迷霧程度（0–1）：各區域依權重混合，邊界平滑過渡 */
export function mistLevelAt(regions: readonly RegionDef[], stages: MistStages, x: number, z: number): number {
  let total = 0;
  let sum = 0;
  for (const r of regions) {
    if (r.id === DEFAULT_REGION) continue;
    const w = weightAt(r, x, z);
    if (w <= 0) continue;
    total += w;
    sum += w * mistLevelOf(stages[r.id]);
  }
  // 區域重疊時權重總和可能超過 1，正規化；不足 1 的部分由預設區域補上
  if (total > 1) return sum / total;
  return sum + (1 - total) * mistLevelOf(stages[DEFAULT_REGION]);
}
