// 戰鬥資料與數值（規格 6.6）：一種敵人（迷霧生物）、一種主要攻擊、一種特殊技能。
// 生成規則由 game-core 決定（規格 1.4：迷霧生物生成率依區域迷霧階段）。
import { z } from 'zod';
import type { MistStage } from '../world/mist';
import { mistStages } from '../world/mist';
import { regionIds } from '../world/types';

export const enemyDefSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  maxHp: z.number().positive(),
  /** 每次攻擊對玩家的傷害 */
  damage: z.number().positive(),
  moveSpeed: z.number().positive(),
  /** 玩家進入這個距離開始追擊 */
  aggroRadius: z.number().positive(),
  /** 攻擊距離（水平） */
  attackRange: z.number().positive(),
  /** 攻擊前搖（秒）：預備動作後才判定命中，玩家看得到、躲得開 */
  attackWindup: z.number().nonnegative(),
  attackCooldown: z.number().positive(),
  /** 離開生成點超過這個距離就放棄追擊、返回並回滿血 */
  leashRadius: z.number().positive(),
  /** 擊敗後掉落（掉落表 id） */
  lootTableId: z.string().min(1).optional(),
});
export type EnemyDef = z.infer<typeof enemyDefSchema>;

export const spawnerSchema = z.object({
  id: z.string().min(1),
  regionId: z.enum(regionIds),
  enemy: z.string().min(1),
  center: z.tuple([z.number(), z.number()]),
  /** 生成與巡邏範圍半徑 */
  radius: z.number().positive(),
  /** 依區域迷霧階段，同時存在的上限 */
  budget: z.object(Object.fromEntries(mistStages.map((s) => [s, z.number().int().nonnegative()])) as Record<MistStage, z.ZodNumber>),
  /** 被擊敗後多久補充一隻（遊戲時間秒） */
  respawnSec: z.number().positive(),
});
export type SpawnerDef = z.infer<typeof spawnerSchema>;

export type CombatData = { enemies: ReadonlyMap<string, EnemyDef>; spawners: readonly SpawnerDef[] };

export function parseCombatData(rawEnemies: unknown, rawSpawners: unknown, lootTableIds: ReadonlySet<string>): CombatData {
  const enemies = new Map<string, EnemyDef>();
  for (const e of z.array(enemyDefSchema).parse(rawEnemies)) {
    if (enemies.has(e.id)) throw new Error(`敵人 id 重複：${e.id}`);
    if (e.lootTableId && !lootTableIds.has(e.lootTableId)) throw new Error(`敵人 ${e.id} 參照不存在的掉落表：${e.lootTableId}`);
    enemies.set(e.id, e);
  }
  const spawners = z.array(spawnerSchema).parse(rawSpawners);
  const seen = new Set<string>();
  for (const s of spawners) {
    if (seen.has(s.id)) throw new Error(`生成點 id 重複：${s.id}`);
    seen.add(s.id);
    if (!enemies.has(s.enemy)) throw new Error(`生成點 ${s.id} 參照不存在的敵人：${s.enemy}`);
  }
  return { enemies, spawners };
}

/** 玩家的戰鬥數值（第一版固定；之後可隨裝備成長） */
export const PLAYER_STATS = {
  maxHp: 100,
  /** 主要攻擊：前方扇形 */
  attack: { damage: 25, range: 2.1, arcDeg: 110, cooldown: 0.55, hitDelay: 0.22 },
  /** 特殊技能「星光衝擊」：以自己為中心的範圍攻擊 */
  skill: { damage: 40, radius: 3.6, cooldown: 6, hitDelay: 0.35 },
  /** 脫離戰鬥多久後開始回血，以及每秒回復量 */
  regenDelay: 5,
  regenPerSec: 4,
  /** 被擊中後的無敵時間（秒），避免同一幀被多隻連續命中 */
  invulnerableSec: 0.6,
  /** 在自己蓋的營火旁：回血開始得更快、速度更高 */
  campfire: { radius: 3.5, regenDelay: 1, regenPerSec: 14 },
} as const;

/**
 * 命中判定（規格 6.6：不依賴動畫事件）：目標的水平位置是否在攻擊範圍內。
 * attack：以玩家面向為中心的扇形；skill：圓形。目標有半徑（身體大小）。
 */
export function isInAttackArea(
  kind: 'attack' | 'skill',
  player: { x: number; z: number; facingYaw: number },
  target: { x: number; z: number; radius: number },
): boolean {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (kind === 'skill') return dist <= PLAYER_STATS.skill.radius + target.radius;
  if (dist > PLAYER_STATS.attack.range + target.radius) return false;
  if (dist < target.radius) return true;
  const facing = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(facing - player.facingYaw), Math.cos(facing - player.facingYaw));
  return Math.abs(diff) <= ((PLAYER_STATS.attack.arcDeg / 2) * Math.PI) / 180;
}
