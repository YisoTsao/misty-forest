// 戰鬥資料與數值（規格 6.6）：敵人（迷霧噗啾與任務 7C 的 3D 模型怪物）與玩家數值。
// 生成規則由 game-core 決定（規格 1.4：迷霧生物生成率依區域迷霧階段）。
import { z } from 'zod';
import type { MistStage } from '../world/mist';
import { mistStages } from '../world/mist';
import { regionIds } from '../world/types';

const point = z.tuple([z.number(), z.number()]);

/**
 * 頭目（任務 8D）。招式都有預兆（Bible §11.2）：
 * - spikes 根刺：玩家腳下與周圍出現 count 個地面標記（第二階段 count2 個），windup 秒後根刺突起，標記半徑內受傷
 * - slam 跳躍震地：windup 秒蹲下蓄力（落點標記已出現），air 秒跳到落點，落地時半徑內受傷，之後 recoverSec 秒卡在地上（破綻）
 * - spores 睡眠孢子：windup 秒菌傘鼓起，朝面向吹出扇形孢子（range、arcDeg），命中受傷並讓玩家昏昏欲睡（變慢）
 * - guard 縮入菌傘：連續被打 afterHits 下後縮起來 sec 秒，受到的傷害 × scale
 * shield：迷霧護盾，依已注水的水槽數（0..troughs）決定受到的傷害倍率；水槽沒有全部注水前打不倒（血量最少留 1）
 */
export const bossDefSchema = z
  .object({
    /** 戰場：中心、半徑（頭目不會離開）、玩家走進 trigger 半徑內開戰 */
    arena: z.object({ center: point, radius: z.number().positive(), trigger: z.number().positive() }),
    /** 開戰時出現的位置 */
    home: point,
    /** 戰場中不能走進去的圓（巨大蘑菇樹的樹幹） */
    avoid: z.object({ center: point, radius: z.number().positive() }).optional(),
    /** 開戰的條件：questActive 任務進行中（任務 8D-2）／ questCompleted 任務已完成 */
    requires: z.object({ questActive: z.string().min(1).optional(), questCompleted: z.string().min(1).optional() }).optional(),
    /** 戰場入口：開戰後樹根封住（中心、寬度、面向）；省略時是開闊的戰場（任務 7E 高地） */
    gate: z.object({ center: point, width: z.number().positive(), yaw: z.number() }).optional(),
    /** 倒下後重新站起來的位置（戰場外） */
    retryAt: point,
    /** 戰場邊緣的水槽（placement id）：戰鬥中才能注水；省略時沒有迷霧護盾 */
    troughs: z.array(z.string().min(1)).default([]),
    shield: z.array(z.number().positive().max(1)).default([1]),
    /**
     * 暈眩（任務 7E 霧團噗啾王，Bible §5.5 弱點）：蓄力時轉動 mirrors 裡的星光鏡把燈塔的光引過來，頭目暈眩 sec 秒（破綻）。
     */
    stun: z.object({ mirrors: z.array(z.string().min(1)).min(1), sec: z.number().positive() }).optional(),
    /**
     * 倒影（任務 9E 璃漪，Bible §7.5）：真身被分身倒影遮住，不在破綻（暈眩、震地後卡住）時受到的傷害 × scale；
     * 用水鏡讓牠暈眩（真身顯形）時才打得痛。
     */
    veil: z.object({ scale: z.number().min(0).max(1) }).optional(),
    introSec: z.number().nonnegative(),
    moveSpeed: z.number().positive(),
    /** 身體半徑（避開樹幹、留在戰場內、追擊時保持的距離） */
    bodyRadius: z.number().positive().default(1.6),
    /** 第二階段：血量比例低於這個值 */
    phase2Below: z.number().gt(0).lt(1),
    /** 第二階段的招式冷卻倍率 */
    phase2Cooldown: z.number().positive().max(1),
    recoverScale: z.number().min(1),
    /** 連續被打 afterHits 下後縮起來防禦；省略時不會防禦 */
    guard: z.object({ afterHits: z.number().int().positive(), sec: z.number().positive(), scale: z.number().min(0).max(1) }).optional(),
    /**
     * 淨化（第二章 Phase 4，規格 B-01 第三階段）：血量歸零時不會死，而是停在 1 點並進入淨化；
     * 戰場上的共鳴石柱（pillars，activate 時帶這個頭目）全部啟動後才算打倒（BossDefeated）。
     */
    purify: z.object({ pillars: z.array(z.string().min(1)).min(1) }).optional(),
    /** 文字（提示、戰前台詞）的 i18n 前綴，例如 boss → boss.intro、boss.hint */
    textKey: z.string().min(1).default('boss'),
    moves: z.object({
      spikes: z.object({ windup: z.number().positive(), damage: z.number().positive(), radius: z.number().positive(), count: z.number().int().positive(), count2: z.number().int().positive(), spread: z.number().positive(), cooldown: z.number().positive() }).optional(),
      slam: z.object({ windup: z.number().positive(), air: z.number().positive(), damage: z.number().positive(), radius: z.number().positive(), recoverSec: z.number().positive(), minRange: z.number().nonnegative(), cooldown: z.number().positive() }).optional(),
      spores: z.object({ windup: z.number().positive(), damage: z.number().positive(), range: z.number().positive(), arcDeg: z.number().positive().max(360), slowSec: z.number().positive(), slowScale: z.number().positive().max(1), cooldown: z.number().positive() }).optional(),
      /** 衝撞：windup 秒蓄力（前 70% 會轉向），沿直線衝 distance 公尺；衝刺途中碰到玩家（radius）就受傷 */
      charge: z.object({ windup: z.number().positive(), speed: z.number().positive(), distance: z.number().positive(), damage: z.number().positive(), radius: z.number().positive(), minRange: z.number().nonnegative(), cooldown: z.number().positive() }).optional(),
      /** 彈出小霧球：windup 秒後在身邊一圈（ring 公尺）與玩家腳下落下 count 顆霧球（第二階段 count2 顆），標記半徑內受傷 */
      orbs: z.object({ windup: z.number().positive(), damage: z.number().positive(), radius: z.number().positive(), count: z.number().int().positive(), count2: z.number().int().positive(), ring: z.number().positive(), cooldown: z.number().positive() }).optional(),
    }),
  })
  .refine((b) => Object.values(b.moves).some((m) => m !== undefined), { message: '頭目至少要有一招', path: ['moves'] });
export type BossDef = z.infer<typeof bossDefSchema>;
export type BossMoveId = keyof BossDef['moves'];
export const bossMoveIds = ['spikes', 'slam', 'spores', 'charge', 'orbs'] as const satisfies readonly BossMoveId[];

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
   * - spit（迷霧芽怪）：在 minRange–range 之間時吐出緩速泥團（前搖 windup、冷卻 cooldown），命中扣 damage 並讓玩家變慢；
   *   retreat（任務 9B 霧鷺影）：吐完立刻向後瞬移 retreat 公尺，拉開距離
   * - carapace（任務 9B 鏡殼蟹，Bible §7.6）：正面（面向兩側 arcDeg / 2 以內）被打時受到的傷害 × frontScale；
   *   側面、背後一般傷害；出手後有 recoverSec 秒的破綻（× recoverScale，不分方向）
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
        retreat: z.number().positive().optional(),
      }),
      z.object({
        kind: z.literal('carapace'),
        arcDeg: z.number().positive().max(360),
        frontScale: z.number().min(0).max(1),
        recoverSec: z.number().positive(),
        recoverScale: z.number().min(1),
      }),
    ])
    .optional(),
  /** 被擊敗時分裂成 count 隻 enemy（任務 9B 水泡精，Bible §7.6）：分裂出來的不會再分裂、不佔生成點的數量 */
  splitInto: z.object({ enemy: z.string().min(1), count: z.number().int().positive().max(4) }).optional(),
  /** 被玩家攻擊命中的半徑（公尺，水平）；省略時 0.5（一般怪物），頭目較大 */
  hitRadius: z.number().positive().optional(),
  /** 區域頭目（任務 8D，Bible §27.4）：不由一般生成點補充，玩家走進戰場時開戰；有自己的 AI 與招式（bossAi.ts） */
  boss: bossDefSchema.optional(),
  /** 程式產生的造型（任務 8B：霧孢飛蛾、根鬚甲蟲）；與 model 二選一，都省略時為迷霧噗啾 */
  procedural: z.enum(['fog_moth', 'root_beetle', 'bubble_wisp', 'bubble_wisp_small', 'mist_heron', 'mirror_crab']).optional(),
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
  /** 不自動補充（頭目：由 StartBossFight 生成，任務 8D） */
  manual: z.boolean().optional(),
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
    if (e.splitInto && e.boss) throw new Error(`頭目 ${e.id} 不能分裂`);
    if (e.boss && e.boss.shield.length !== e.boss.troughs.length + 1) throw new Error(`頭目 ${e.id} 的護盾倍率數量必須是水槽數 + 1`);
    if (e.boss && e.boss.shield.at(-1) !== 1) throw new Error(`頭目 ${e.id} 的水槽全部注水後護盾倍率必須是 1`);
    enemies.set(e.id, e);
  }
  for (const e of enemies.values()) {
    if (!e.splitInto) continue;
    const child = enemies.get(e.splitInto.enemy);
    if (!child) throw new Error(`敵人 ${e.id} 分裂成不存在的敵人：${e.splitInto.enemy}`);
    if (child.splitInto) throw new Error(`敵人 ${e.id} 分裂出來的 ${child.id} 不能再分裂`);
  }
  const spawners = z.array(spawnerSchema).parse(rawSpawners);
  const seen = new Set<string>();
  for (const s of spawners) {
    if (seen.has(s.id)) throw new Error(`生成點 id 重複：${s.id}`);
    seen.add(s.id);
    if (!enemies.has(s.enemy)) throw new Error(`生成點 ${s.id} 參照不存在的敵人：${s.enemy}`);
    if (Boolean(enemies.get(s.enemy)?.boss) !== Boolean(s.manual)) throw new Error(`生成點 ${s.id}：頭目只能用 manual 生成點，manual 生成點只能放頭目`);
  }
  for (const e of enemies.values()) {
    if (e.boss && spawners.filter((s) => s.enemy === e.id).length !== 1) throw new Error(`頭目 ${e.id} 必須剛好有一個生成點`);
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

/** 敵人目前的姿態對受到傷害的倍率（根鬚甲蟲縮殼 / 鏡殼蟹正面時減傷、出手後的破綻時加傷；頭目縮入菌傘、震地後卡住） */
export type EnemyStance = 'guard' | 'recover';

export function stanceDamageScale(def: EnemyDef, stance: EnemyStance | undefined): number {
  if (stance && def.boss) return stance === 'guard' ? (def.boss.guard?.scale ?? 1) : def.boss.recoverScale;
  if (!stance) return 1;
  if (def.behavior?.kind === 'carapace') return stance === 'guard' ? def.behavior.frontScale : def.behavior.recoverScale;
  if (def.behavior?.kind !== 'shell') return 1;
  return stance === 'guard' ? def.behavior.guardScale : def.behavior.recoverScale;
}

/** 頭目的生成點（parseCombatData 已檢查每個頭目剛好一個） */
export function bossSpawner(data: CombatData, bossId: string): SpawnerDef | undefined {
  return data.spawners.find((s) => s.enemy === bossId);
}

/** 頭目的迷霧護盾倍率：依已注水的水槽數 */
export function bossShieldScale(boss: BossDef, filled: number): number {
  return boss.shield[Math.max(0, Math.min(boss.shield.length - 1, filled))]!;
}

/** 頭目的開戰條件是否達成（不含是否已擊敗、是否已在戰鬥中） */
export function bossRequirementsMet(boss: BossDef, quests: Readonly<Record<string, { status: 'active' | 'completed' }>>): boolean {
  const { questActive, questCompleted } = boss.requires ?? {};
  if (questActive && quests[questActive]?.status !== 'active') return false;
  if (questCompleted && quests[questCompleted]?.status !== 'completed') return false;
  return true;
}
