// NPC 定義（規格 5.2：NPC 有碰撞、可互動、不持久化；6.4：待機與簡單移動）。
import { z } from 'zod';
import { conditionSchema } from '../dialogue/conditions';
import { regionIds } from '../world/types';

const point = z.tuple([z.number(), z.number()]);

export const npcDefSchema = z
  .object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  regionId: z.enum(regionIds),
  /** 外觀：與玩家同骨架的角色模型，或 `procedural:<id>`（程式造型，例如戰後的苔咚） */
  model: z.string().min(1),
  scale: z.number().positive(),
  hiddenNodes: z.array(z.string()),
  /** 角色模型的動畫片段（程式造型不需要） */
  clips: z.object({ idle: z.string().min(1), walk: z.string().min(1), talk: z.string().min(1) }).optional(),
  /** 出現的條件（任務 8D-2：苔咚在戰後才成為 NPC）；省略時一直都在 */
  visible: conditionSchema.optional(),
  /** 說話的聲音：bubble 為泡泡音（不會說完整句子的苔咚）；省略時是一般的翻頁音 */
  voice: z.enum(['bubble']).optional(),
  /** 站立位置與面向（yaw，0 = 面向 +Z） */
  position: point,
  /** 地板高度（室內 NPC 使用；省略時貼齊地形） */
  floorY: z.number().optional(),
  facingYaw: z.number(),
  interactRadius: z.number().positive(),
  /** 依序檢查，第一個符合條件的對話 */
  talk: z.array(z.object({ when: conditionSchema.optional(), dialogue: z.string().min(1) })).min(1),
  /** 簡單移動：在幾個點之間來回走，每個點停留 pauseSec 秒 */
  patrol: z.object({ points: z.array(point).min(2), speed: z.number().positive(), pauseSec: z.number().nonnegative() }).optional(),
  })
  .refine((n) => n.model.startsWith('procedural:') || n.clips !== undefined, { message: '角色模型的 NPC 必須提供 clips', path: ['clips'] });
export type NpcDef = z.infer<typeof npcDefSchema>;

export function parseNpcs(raw: unknown, dialogueIds: ReadonlySet<string>): NpcDef[] {
  const list = z.array(npcDefSchema).parse(raw);
  const seen = new Set<string>();
  for (const npc of list) {
    if (seen.has(npc.id)) throw new Error(`NPC id 重複：${npc.id}`);
    seen.add(npc.id);
    for (const t of npc.talk) {
      if (!dialogueIds.has(t.dialogue)) throw new Error(`NPC ${npc.id} 參照不存在的對話：${t.dialogue}`);
    }
  }
  return list;
}

/** 巡邏狀態（本機暫態，NPC 不持久化） */
export type PatrolState = { target: number; wait: number };

/**
 * 推進一幀巡邏：走向目前目標點，到達後停留 pauseSec 秒再換下一點。
 * 回傳新位置、面向與是否在走路（決定動畫）。talking 時原地不動。
 */
export function stepPatrol(
  patrol: NonNullable<NpcDef['patrol']>,
  state: PatrolState,
  pos: { x: number; z: number },
  dt: number,
): { x: number; z: number; yaw: number | null; walking: boolean } {
  if (state.wait > 0) {
    state.wait = Math.max(0, state.wait - dt);
    return { ...pos, yaw: null, walking: false };
  }
  const [tx, tz] = patrol.points[state.target]!;
  const dx = tx - pos.x;
  const dz = tz - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = patrol.speed * dt;
  if (dist <= step) {
    state.target = (state.target + 1) % patrol.points.length;
    state.wait = patrol.pauseSec;
    return { x: tx, z: tz, yaw: Math.atan2(dx, dz), walking: false };
  }
  return { x: pos.x + (dx / dist) * step, z: pos.z + (dz / dist) * step, yaw: Math.atan2(dx, dz), walking: true };
}
