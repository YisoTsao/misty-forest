// 魔法（GAME_DESIGN 5.4、決策 G-06）：以星光值（MP）施放；法術數值與外觀參數是資料（data/spells.json）。
// 純函式：資料驗證、MP 回復、追蹤彈的目標選擇與轉向、範圍判定。命中仍由 game-core 判定，不依賴特效。
import { z } from 'zod';

/** 星光值上限與每秒回復量 */
export const MAX_MP = 100;
export const MP_REGEN_PER_SEC = 6;

export const spellKinds = ['nova', 'bolt', 'meteor'] as const;
export type SpellKind = (typeof spellKinds)[number];

const color = z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]);

const spellSchema = z.object({
  id: z.string().regex(/^spell_[a-z0-9_]+$/),
  nameKey: z.string().min(1),
  icon: z.string().min(1),
  /** 施放用的輸入動作 */
  action: z.enum(['skill', 'spell2', 'spell3']),
  kind: z.enum(spellKinds),
  mpCost: z.number().int().positive().max(MAX_MP),
  cooldown: z.number().positive(),
  /** 蓄力時間（秒）：魔法陣出現到發動 */
  castTime: z.number().nonnegative(),
  /** 整個動作鎖定時間（秒，含蓄力） */
  duration: z.number().positive(),
  damage: z.number().positive(),
  /** nova / meteor：範圍半徑；bolt：彈體命中半徑 */
  radius: z.number().positive(),
  knockback: z.number().nonnegative(),
  projectiles: z
    .object({
      count: z.number().int().positive().max(8),
      speed: z.number().positive(),
      /** 最遠飛行距離 */
      range: z.number().positive(),
      /** 追蹤轉向速率（弧度 / 秒） */
      turnRate: z.number().nonnegative(),
      /** 多枚彈體的發射扇形角度 */
      spreadDeg: z.number().nonnegative(),
      /** 前方多少角度內的敵人可以被鎖定 */
      seekDeg: z.number().positive().max(360),
    })
    .optional(),
  meteor: z
    .object({
      count: z.number().int().positive().max(12),
      /** 落點中心在玩家前方多遠 */
      distance: z.number().positive(),
      /** 每顆流星的間隔（秒） */
      interval: z.number().positive(),
      /** 流星從開始落下到撞擊的時間（秒） */
      fallTime: z.number().positive(),
      /** 每顆流星的撞擊半徑；最後一顆另外用 radius */
      impactRadius: z.number().positive(),
    })
    .optional(),
  clips: z.object({ cast: z.string().min(1), release: z.string().min(1) }),
  /** 特效主色（HDR，> 1 會觸發 Bloom） */
  color,
});
export type SpellDef = z.infer<typeof spellSchema>;
export type SpellCatalog = ReadonlyMap<string, SpellDef>;

export function parseSpells(raw: unknown): SpellCatalog {
  const list = z.array(spellSchema).parse(raw);
  const map = new Map<string, SpellDef>();
  const actions = new Set<string>();
  for (const s of list) {
    if (map.has(s.id)) throw new Error(`法術 id 重複：${s.id}`);
    if (actions.has(s.action)) throw new Error(`兩個法術使用同一個按鍵動作：${s.action}`);
    if (s.castTime >= s.duration) throw new Error(`法術 ${s.id} 的蓄力時間必須短於動作時間`);
    if (s.kind === 'bolt' && !s.projectiles) throw new Error(`法術 ${s.id}（bolt）缺少 projectiles`);
    if (s.kind === 'meteor' && !s.meteor) throw new Error(`法術 ${s.id}（meteor）缺少 meteor`);
    actions.add(s.action);
    map.set(s.id, s);
  }
  return map;
}

/** 經過 dt 秒後的星光值 */
export function regenMp(mp: number, dt: number): number {
  return Math.min(MAX_MP, mp + MP_REGEN_PER_SEC * Math.max(0, dt));
}

type Point = { x: number; z: number };

/** 追蹤彈的目標：前方 seekDeg 範圍內、range 以內最近的敵人；沒有則回傳 null（直飛）。 */
export function pickSeekTarget<T extends Point>(origin: Point, facingYaw: number, targets: Iterable<T>, seekDeg: number, range: number): T | null {
  let best: T | null = null;
  let bestDist = range;
  const half = ((seekDeg / 2) * Math.PI) / 180;
  for (const t of targets) {
    const dx = t.x - origin.x;
    const dz = t.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestDist) continue;
    const yaw = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(yaw - facingYaw), Math.cos(yaw - facingYaw));
    if (Math.abs(diff) > half) continue;
    best = t;
    bestDist = dist;
  }
  return best;
}

/** 追蹤彈每幀轉向：水平方向（yaw）以 turnRate 弧度 / 秒轉向目標，回傳新的 yaw。 */
export function steerYaw(current: number, from: Point, to: Point, turnRate: number, dt: number): number {
  const desired = Math.atan2(to.x - from.x, to.z - from.z);
  const diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  const step = turnRate * dt;
  return current + Math.max(-step, Math.min(step, diff));
}

/** 範圍法術（nova / meteor）是否打到目標：以中心點為圓心、半徑加上目標身體半徑 */
export function isInBlast(center: Point, radius: number, target: Point & { radius: number }): boolean {
  return Math.hypot(target.x - center.x, target.z - center.z) <= radius + target.radius;
}

export type MeteorPlanItem = { x: number; z: number; delay: number; final: boolean };

/**
 * 流星雨的落點與時間（任務 6E）：前面幾顆隨機散落在範圍內（中心附近較多），間隔 interval 秒；
 * 最後一顆落在正中心、稍微晚一點，範圍最大。random 由呼叫端注入（測試可重現）。
 */
export function meteorPlan(spell: SpellDef, center: Point, random: () => number): MeteorPlanItem[] {
  const m = spell.meteor;
  if (!m) return [];
  return Array.from({ length: m.count }, (_, i) => {
    const final = i === m.count - 1;
    if (final) return { x: center.x, z: center.z, delay: i * m.interval + m.interval, final };
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * spell.radius * 0.75;
    return { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r, delay: i * m.interval, final };
  });
}

/** 多枚彈體的發射方向：以 facingYaw 為中心平均分布在 spreadDeg 扇形內 */
export function spreadYaws(facingYaw: number, count: number, spreadDeg: number): number[] {
  if (count === 1) return [facingYaw];
  const spread = (spreadDeg * Math.PI) / 180;
  return Array.from({ length: count }, (_, i) => facingYaw - spread / 2 + (spread * i) / (count - 1));
}
