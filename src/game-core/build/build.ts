// 建造（規格 6.7）：營火、簡單家具、裝飾。網格吸附、檢查坡度與碰撞、確認後才扣材料；
// 已放置物以資料列表（類型、位置、旋轉）保存。不做施工模擬與地形編輯。
import { z } from 'zod';
import { hasItems, type Inventory } from '../inventory/inventory';
import type { ItemStack } from '../items/items';
import { ISLAND, terrainHeight, WATER_LEVEL } from '../world/terrain';

export const buildableSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  /** 外觀與碰撞取自這個 prefab（prefabs.json） */
  prefabId: z.string().min(1),
  /** 模型縮放 */
  scale: z.number().positive(),
  /** 佔地半徑（公尺）：放置檢查以圓形計算 */
  footprint: z.number().positive(),
  cost: z.array(z.object({ itemId: z.string().min(1), count: z.number().int().positive() })).min(1),
  /** 建造選單的分類 */
  category: z.enum(['structure', 'furniture', 'decoration']),
  /** 選單顯示用的圖示（物品圖示 id） */
  icon: z.string().min(1),
  /** 接過這個任務（進行中或完成）才出現在建造選單（任務 7K：桃樂教的花圃） */
  unlock: z.object({ quest: z.string().min(1) }).optional(),
  /**
   * 會長大的建造物（任務 7K 花圃）：放置後依遊戲時間換成下一階段的 prefab（Bible §22.1：簡化的階段式成長，不依賴真實世界時間）。
   * stages 為各階段的 prefab，seconds 為進入第 2、3…階段所需的遊戲秒數。
   */
  growth: z.object({ stages: z.array(z.string().min(1)).min(2), seconds: z.array(z.number().positive()).min(1) }).optional(),
});
export type BuildableDef = z.infer<typeof buildableSchema>;
export type BuildableCatalog = ReadonlyMap<string, BuildableDef>;

export function parseBuildables(raw: unknown, refs: { prefabs: ReadonlySet<string>; items: ReadonlySet<string> }): Map<string, BuildableDef> {
  const map = new Map<string, BuildableDef>();
  for (const b of z.array(buildableSchema).parse(raw)) {
    if (map.has(b.id)) throw new Error(`建造物 id 重複：${b.id}`);
    if (!refs.prefabs.has(b.prefabId)) throw new Error(`建造物 ${b.id} 參照不存在的 prefab：${b.prefabId}`);
    for (const c of b.cost) if (!refs.items.has(c.itemId)) throw new Error(`建造物 ${b.id} 參照不存在的物品：${c.itemId}`);
    if (b.growth) {
      if (b.growth.seconds.length !== b.growth.stages.length - 1) throw new Error(`建造物 ${b.id} 的成長時間數量必須是階段數 - 1`);
      for (const p of b.growth.stages) if (!refs.prefabs.has(p)) throw new Error(`建造物 ${b.id} 參照不存在的 prefab：${p}`);
    }
    map.set(b.id, b);
  }
  return map;
}

/** 已放置的建造物（權威狀態）；高度一律貼齊地形。placedAt：放置時的遊戲時間（會長大的建造物用，舊存檔沒有） */
export type Building = { readonly id: string; readonly buildable: string; readonly x: number; readonly z: number; readonly yaw: number; readonly placedAt?: number };

/** 會長大的建造物目前的階段（0 起算）；不會長大的為 0 */
export function growthStage(def: BuildableDef, building: Building, time: number): number {
  if (!def.growth) return 0;
  const age = time - (building.placedAt ?? -Infinity);
  return def.growth.seconds.filter((s) => age >= s).length;
}

/** 建造選單是否顯示（unlock 的任務已接取或完成） */
export function isBuildableUnlocked(def: BuildableDef, quests: Readonly<Record<string, { status: string }>>): boolean {
  return !def.unlock || quests[def.unlock.quest] !== undefined;
}

/** 可以建造的範圍：湖心小島「旅人小屋」的平坦頂面 */
export const BUILD_AREA = { x: ISLAND.x, z: ISLAND.z, radius: ISLAND.radius } as const;
/** 網格大小（公尺）與旋轉間隔 */
export const BUILD_GRID = 0.5;
export const BUILD_ROTATE_STEP = Math.PI / 4;
/** 允許的最大坡度（佔地範圍內最高與最低點的高度差 / 半徑） */
const MAX_SLOPE = Math.tan((14 * Math.PI) / 180);
/** 建造物彼此之間的最小間隙 */
const GAP = 0.1;

export function snapToGrid(v: number): number {
  return Math.round(v / BUILD_GRID) * BUILD_GRID;
}

export function snapYaw(yaw: number): number {
  const step = Math.round(yaw / BUILD_ROTATE_STEP);
  return (((step % 8) + 8) % 8) * BUILD_ROTATE_STEP;
}

export type PlacementProblem = 'outside-area' | 'underwater' | 'too-steep' | 'blocked' | 'missing-materials';

/**
 * 放置檢查（純函式）。依序回報第一個問題；沒有問題回傳 null。
 * isOccupied：世界中靜態物件（樹、岩石、房屋、木橋）的佔用查詢，由呼叫端提供。
 */
export function placementProblem(
  def: BuildableDef,
  at: { x: number; z: number },
  existing: readonly Building[],
  catalog: BuildableCatalog,
  inventory: Inventory,
  isOccupied: (x: number, z: number, margin: number) => boolean,
): PlacementProblem | null {
  const { x, z } = at;
  if (Math.hypot(x - BUILD_AREA.x, z - BUILD_AREA.z) + def.footprint > BUILD_AREA.radius) return 'outside-area';
  const samples = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => terrainHeight(x + dx! * def.footprint, z + dz! * def.footprint));
  if (Math.min(...samples) < WATER_LEVEL + 0.2) return 'underwater';
  if ((Math.max(...samples) - Math.min(...samples)) / Math.max(def.footprint, 0.5) > MAX_SLOPE) return 'too-steep';
  if (isOccupied(x, z, def.footprint)) return 'blocked';
  for (const b of existing) {
    const other = catalog.get(b.buildable);
    if (other && Math.hypot(b.x - x, b.z - z) < other.footprint + def.footprint + GAP) return 'blocked';
  }
  if (!hasItems(inventory, def.cost)) return 'missing-materials';
  return null;
}

/** 拆除時退還的材料：全額退還（第一版不設損耗） */
export function refundFor(def: BuildableDef): ItemStack[] {
  return def.cost.map((c) => ({ ...c }));
}
