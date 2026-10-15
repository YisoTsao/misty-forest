// 區域（規格 5.1）與各區域的迷霧（規格 1.4、4.5；R-03）。
// 權威狀態只存每區三段（濃 / 淡 / 清），畫面上的 mistLevel 由玩家所在位置在區域之間平滑混合。
import { z } from 'zod';
import { mistLevelOf, mistStages, type MistStage } from './mist';
import { mapAt } from './maps';
import { polylineDistance } from './terrain';
import { regionIds, type RegionId } from './types';

/** 晨曦谷地沒有落在任何區域範圍內時所屬的區域（開闊的草原）；其他地圖見 MapDef.defaultRegion */
export const DEFAULT_REGION: RegionId = 'meadow';

export const regionDefSchema = z.object({
  id: z.enum(regionIds),
  nameKey: z.string().min(1),
  /**
   * 範圍：圓形（center）或沿折線的帶狀（path，例如溪流，radius 為離中心線的距離）；
   * 省略表示這個區域還沒有實際場地（例如之後才加入的區域）
   */
  area: z
    .object({
      center: z.tuple([z.number(), z.number()]),
      /** 帶狀範圍的中心線；有此欄位時 center 只作為地圖標籤位置 */
      path: z.array(z.tuple([z.number(), z.number()])).min(2).optional(),
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

/** 新遊戲的迷霧：出生草原與農田晴朗，村莊、湖泊、溪流、高地淡霧，森林與遺跡濃霧（第一章要逐步驅散） */
export const initialMistStages: MistStages = {
  meadow: 'clear',
  village: 'light',
  forest: 'dense',
  lake: 'light',
  home: 'clear',
  overlook: 'light',
  ruins: 'dense',
  highland: 'light',
  farmland: 'clear',
  river: 'light',
  // 螢苔祕林：入口的小徑淡霧，林地深處、根鬚迷宮與苔冠空地濃霧（第二章要逐步恢復）
  moss_trail: 'light',
  moss_glade: 'light',
  root_maze: 'dense',
  moss_crown: 'dense',
  // 澄鏡湖：營地與湖岸淡霧（湖面薄霧白），蘆葦島、遺構、神殿濃霧（第三章要逐步恢復）
  lake_shore: 'light',
  lake_camp: 'light',
  reed_isle: 'dense',
  mirror_ruins: 'dense',
  mirror_temple: 'dense',
  // 風語草原：草原與聚落淡霧（開闊、看得遠），山脊、風向塔與競技場濃霧（第四章要逐步恢復）
  windy_hills: 'light',
  windmill_hamlet: 'light',
  floatstone_ridge: 'dense',
  wind_tower: 'dense',
  golem_arena: 'dense',
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
  const { center, path, radius, blend } = region.area;
  const d = path ? polylineDistance(x, z, path) : Math.hypot(x - center[0], z - center[1]);
  return 1 - smoothstep(radius - blend / 2, radius + blend / 2, d);
}

/** (x, z) 所屬的區域（權重最大者；都不在範圍內則為所在地圖的預設區域） */
export function regionAt(regions: readonly RegionDef[], x: number, z: number): RegionId {
  let best: RegionId = mapAt(x, z).defaultRegion;
  let bestWeight = 0.5;
  let bestRadius = Infinity;
  for (const r of regions) {
    const w = weightAt(r, x, z);
    const radius = r.area?.radius ?? Infinity;
    // 權重相同（例如湖心小島同時在湖與家園範圍內）時，取範圍較小、較具體的區域
    if (w > bestWeight + 1e-6 || (Math.abs(w - bestWeight) <= 1e-6 && radius < bestRadius)) {
      best = r.id;
      bestWeight = w;
      bestRadius = radius;
    }
  }
  return best;
}

/** (x, z) 的迷霧程度（0–1）：各區域依權重混合，邊界平滑過渡 */
export function mistLevelAt(regions: readonly RegionDef[], stages: MistStages, x: number, z: number): number {
  const fallback = mapAt(x, z).defaultRegion;
  let total = 0;
  let sum = 0;
  for (const r of regions) {
    if (r.id === fallback) continue;
    const w = weightAt(r, x, z);
    if (w <= 0) continue;
    total += w;
    sum += w * mistLevelOf(stages[r.id]);
  }
  // 區域重疊時權重總和可能超過 1，正規化；不足 1 的部分由預設區域補上
  if (total > 1) return sum / total;
  return sum + (1 - total) * mistLevelOf(stages[fallback]);
}
