// 世界地圖與小地圖上的標記（任務 7B，Bible §31.3）：地標、任務目標、寶箱。純函式，只讀狀態。
import { z } from 'zod';
import { isQuestReady, questStatus, type QuestCatalog } from '../quest/quest';
import type { SpawnerDef } from '../combat/combat';
import type { ObjectRuntime, Placement } from '../world/types';
import type { Inventory } from '../inventory/inventory';

export const landmarkIcons = ['village', 'tavern', 'lighthouse', 'windmill', 'bridge', 'mill', 'ruins', 'peak', 'camp', 'home', 'spawn', 'forest', 'smith', 'gate', 'moon', 'stones', 'mushroom', 'maze', 'water'] as const;
export type LandmarkIcon = (typeof landmarkIcons)[number];

export const landmarkSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  icon: z.enum(landmarkIcons),
  position: z.tuple([z.number(), z.number()]),
});
export type Landmark = z.infer<typeof landmarkSchema>;

export function parseLandmarks(raw: unknown): Landmark[] {
  const list = z.array(landmarkSchema).parse(raw);
  const seen = new Set<string>();
  for (const l of list) {
    if (seen.has(l.id)) throw new Error(`地標 id 重複：${l.id}`);
    seen.add(l.id);
  }
  return list;
}

export type QuestMarker = {
  questId: string;
  /** available：可以接（NPC 頭上「!」）；turnIn：可以回報（「?」）；objective：目標地點 */
  kind: 'available' | 'turnIn' | 'objective';
  x: number;
  z: number;
  /** 目標是一片區域時的半徑（擊敗生成點附近的敵人） */
  radius?: number;
};

type MarkerState = {
  quests: Parameters<typeof questStatus>[0]['quests'];
  inventory: Inventory;
  objects: ReadonlyMap<string, ObjectRuntime>;
};

/**
 * 任務標記：可接取的任務標在委託人身上；進行中的任務標出目標（修理的物件、敵人出沒的區域），
 * 目標都達成時改為標出回報對象。收集類目標沒有固定地點，不標。
 */
export function questMarkers(
  state: MarkerState,
  quests: QuestCatalog,
  ctx: {
    npcPosition: (npcId: string) => { x: number; z: number } | null;
    placement: (id: string) => Placement | undefined;
    spawners: readonly SpawnerDef[];
  },
): QuestMarker[] {
  const out: QuestMarker[] = [];
  for (const q of quests.values()) {
    const status = questStatus(state, q);
    const giver = ctx.npcPosition(q.giver);
    if (status === 'available') {
      if (giver) out.push({ questId: q.id, kind: 'available', ...giver });
      continue;
    }
    if (status !== 'active') continue;
    if (isQuestReady(state, q)) {
      if (giver) out.push({ questId: q.id, kind: 'turnIn', ...giver });
      continue;
    }
    for (const o of q.objectives) {
      if (o.type === 'repair') {
        const p = ctx.placement(o.placementId);
        if (p) out.push({ questId: q.id, kind: 'objective', x: p.position[0], z: p.position[2] });
      } else if (o.type === 'defeat') {
        for (const s of ctx.spawners) {
          if (s.enemy === o.enemy) out.push({ questId: q.id, kind: 'objective', x: s.center[0], z: s.center[1], radius: s.radius });
        }
      }
    }
  }
  return out;
}

/** 小地圖邊緣的指示：目標在可見範圍外時，把標記夾到圓形邊緣（回傳 0–1 的相對位置與是否被夾住） */
export function clampToRadius(dx: number, dz: number, radius: number): { dx: number; dz: number; clamped: boolean } {
  const d = Math.hypot(dx, dz);
  if (d <= radius) return { dx, dz, clamped: false };
  return { dx: (dx / d) * radius, dz: (dz / d) * radius, clamped: true };
}
