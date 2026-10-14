// 戰鬥資料與數值（規格 6.6）：敵人（迷霧噗啾與任務 7C 的 3D 模型怪物）與玩家數值。
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
  /** 出手時往前衝的速度（m/s，之後衰減；角角龍、蘑菇王的衝撞） */
  lunge: z.number().positive().optional(),
  /**
   * 特殊行為（任務 8B，Bible §6.6）：
   * - orbit（霧孢飛蛾）：靠近後先繞著玩家盤旋 sec 秒，再俯衝出手
   * - shell（根鬚甲蟲）：被打到時縮殼 guardSec 秒（受到的傷害 × guardScale）；出手後有 recoverSec 秒的破綻（× recoverScale）
   * - spit（迷霧芽怪）：在 minRange–range 之間時吐出緩速泥團（前搖 windup、冷卻 cooldown），命中扣 damage 並讓玩家變慢
   */
  behavior: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('orbit'), radius: z.number().positive(), sec: z.number().positive(), speed: z.number().positive() }),
      z.object({
        kind: z.literal('shell'),
        guardSec: z.number().positive(),
        guardScale: z.number().min(0).max(1),
        recoverSec: z.number().positive(),
        recoverScale: z.number().min(1),
      }),
      z.object({
        kind: z.literal('spit'),
        minRange: z.number().nonnegative(),
        range: z.number().positive(),
        windup: z.number().positive(),
        cooldown: z.number().positive(),
        speed: z.number().positive(),
        damage: z.number().positive(),
        slowSec: z.number().positive(),
        slowScale: z.number().positive().max(1),
      }),
    ])
    .optional(),
  /** 程式產生的造型（任務 8B：霧孢飛蛾、根鬚甲蟲）；與 model 二選一，都省略時為迷霧噗啾 */
  procedural: z.enum(['fog_moth', 'root_beetle']).optional(),
  /**
   * 3D 模型（任務 7C）：省略時為程式產生的迷霧噗啾。
   * height 為模型頂端離地的高度（公尺，載入時換算縮放）；radius 為碰撞球半徑；hover 為離地高度（飛行）；
   * colors 依材質名稱換底色（同一個模型做出不同怪物、把素材偏暗的顏色調亮）；clips 為各動作使用的動畫片段名稱。
   */
  model: z
    .object({
      path: z.string().min(1),
      height: z.number().positive(),
      radius: z.number().positive(),
      hover: z.number().nonnegative().optional(),
      colors: z.record(z.string().min(1), z.string().regex(/^#[0-9a-fA-F]{6}$/)).optional(),
      clips: z.object({
        idle: z.string().min(1),
        move: z.string().min(1),
        attack: z.string().min(1),
        hit: z.string().min(1),
        death: z.string().min(1),
      }),
    })
    .optional(),
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
    if (e.model && e.procedural) throw new Error(`敵人 ${e.id} 不能同時有模型與程式造型`);
    if (e.behavior?.kind === 'spit' && e.behavior.minRange >= e.behavior.range) throw new Error(`敵人 ${e.id} 的吐泥距離範圍無效`);
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

/** 玩家的戰鬥數值。近戰招式在 data/weapons.json（GAME_DESIGN 5.3），法術在 data/spells.json（5.4）。 */
export const PLAYER_STATS = {
  maxHp: 100,
  /** 脫離戰鬥多久後開始回血，以及每秒回復量 */
  regenDelay: 5,
  regenPerSec: 4,
  /** 被擊中後的無敵時間（秒），避免同一幀被多隻連續命中 */
  invulnerableSec: 0.6,
  /** 在自己蓋的營火旁：回血開始得更快、速度更高 */
  campfire: { radius: 3.5, regenDelay: 1, regenPerSec: 14 },
} as const;

/** 敵人目前的姿態對受到傷害的倍率（根鬚甲蟲縮殼時減傷、出手後的破綻時加傷） */
export type EnemyStance = 'guard' | 'recover';

export function stanceDamageScale(def: EnemyDef, stance: EnemyStance | undefined): number {
  if (!stance || def.behavior?.kind !== 'shell') return 1;
  return stance === 'guard' ? def.behavior.guardScale : def.behavior.recoverScale;
}
