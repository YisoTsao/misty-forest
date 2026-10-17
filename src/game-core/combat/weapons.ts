// 近戰武器與招式（GAME_DESIGN 5.3、決策 G-06）：徒手（拳、踢）、短刀、單手劍；職業（使用者 2026-10-17）另外有大劍、法杖、雙手斧、巨斧。
// 每個職業能用哪些武器由 data/classes.json 決定（game-core/character/heroClass）。
// 每種武器有一組輕擊連段與一個重擊；招式數值、動畫片段與手感參數都是資料（data/weapons.json）。
// 命中判定仍由 game-core 依招式範圍計算，不依賴動畫事件（規格 6.6）。
import { z } from 'zod';

export const weaponIds = ['fist', 'knife', 'sword', 'greatsword', 'staff', 'axe', 'greataxe'] as const;
export type WeaponId = (typeof weaponIds)[number];
export const DEFAULT_WEAPON: WeaponId = 'sword';

const moveSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  /** 角色 GLB 內的動畫片段名稱 */
  clip: z.string().min(1),
  /** 動畫播放速度倍率 */
  speed: z.number().positive(),
  /** 動作鎖定時間（秒）：這段時間內不能移動或出下一招 */
  duration: z.number().positive(),
  /** 出手到命中判定的時間（秒） */
  hitDelay: z.number().nonnegative(),
  damage: z.number().positive(),
  /** 攻擊距離（水平，公尺） */
  range: z.number().positive(),
  /** 以面向為中心的扇形角度；360 為全周 */
  arcDeg: z.number().positive().max(360),
  /** 擊退速度（公尺 / 秒） */
  knockback: z.number().nonnegative(),
  /** 命中時畫面停頓（秒） */
  hitStop: z.number().nonnegative().max(0.2),
  /** 出手時往前衝的速度（公尺 / 秒） */
  lunge: z.number().nonnegative(),
});
export type MoveDef = z.infer<typeof moveSchema>;

const weaponSchema = z.object({
  id: z.enum(weaponIds),
  nameKey: z.string().min(1),
  icon: z.string().min(1),
  /** 揮砍拖尾（刀、劍）；null 表示沒有（徒手） */
  trail: z.object({ color: z.tuple([z.number(), z.number(), z.number()]), width: z.number().positive() }).nullable(),
  light: z.array(moveSchema).min(1),
  heavy: moveSchema.extend({ cooldown: z.number().positive() }),
  /** 前一招結束後多久內再按才接下一招（秒） */
  comboWindow: z.number().positive(),
});
export type WeaponDef = z.infer<typeof weaponSchema>;
export type HeavyMoveDef = WeaponDef['heavy'];

export type WeaponCatalog = {
  weapons: ReadonlyMap<WeaponId, WeaponDef>;
  /** 招式 id → 招式與所屬武器 */
  moves: ReadonlyMap<string, { move: MoveDef; weapon: WeaponId }>;
};

export function parseWeapons(raw: unknown): WeaponCatalog {
  const list = z.array(weaponSchema).parse(raw);
  const weapons = new Map<WeaponId, WeaponDef>();
  const moves = new Map<string, { move: MoveDef; weapon: WeaponId }>();
  for (const w of list) {
    if (weapons.has(w.id)) throw new Error(`武器 id 重複：${w.id}`);
    weapons.set(w.id, w);
    for (const m of [...w.light, w.heavy]) {
      if (moves.has(m.id)) throw new Error(`招式 id 重複：${m.id}`);
      moves.set(m.id, { move: m, weapon: w.id });
    }
  }
  for (const id of weaponIds) if (!weapons.has(id)) throw new Error(`缺少武器：${id}`);
  return { weapons, moves };
}

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && (weaponIds as readonly string[]).includes(value);
}

/** 所有招式用到的動畫片段（角色資產檢查與「只播一次」設定用） */
export function moveClips(catalog: WeaponCatalog): string[] {
  return [...new Set([...catalog.moves.values()].map((m) => m.move.clip))];
}

/** 連段狀態（本機暫態）：下一個輕擊的索引、可接招的期限、重擊可再用的時間。時間單位為秒（任意遞增時鐘）。 */
export type ComboState = { weapon: WeaponId; next: number; windowEnd: number; heavyReadyAt: number };

export function createCombo(weapon: WeaponId): ComboState {
  return { weapon, next: 0, windowEnd: -Infinity, heavyReadyAt: -Infinity };
}

/**
 * 按下輕擊：在連段期限內接下一招，否則從第一招開始；最後一招（終結技）之後回到第一招。
 * 回傳出的招式與新的連段狀態（不修改輸入）。
 */
export function startLight(combo: ComboState, weapon: WeaponDef, now: number): { move: MoveDef; index: number; combo: ComboState } {
  const index = combo.weapon === weapon.id && now <= combo.windowEnd && combo.next < weapon.light.length ? combo.next : 0;
  const move = weapon.light[index]!;
  const last = index === weapon.light.length - 1;
  return {
    move,
    index,
    combo: { ...combo, weapon: weapon.id, next: last ? 0 : index + 1, windowEnd: last ? -Infinity : now + move.duration + weapon.comboWindow },
  };
}

/** 按下重擊：冷卻中回傳 null；出招後連段回到第一招。 */
export function startHeavy(combo: ComboState, weapon: WeaponDef, now: number): { move: HeavyMoveDef; combo: ComboState } | null {
  if (combo.weapon === weapon.id && now < combo.heavyReadyAt) return null;
  const move = weapon.heavy;
  return { move, combo: { weapon: weapon.id, next: 0, windowEnd: -Infinity, heavyReadyAt: now + move.cooldown } };
}

/**
 * 招式的命中範圍（規格 6.6：不依賴動畫事件）：以玩家面向為中心、半徑 range 的扇形；arcDeg = 360 為圓形。
 * 目標有半徑（身體大小），貼身時一定命中。
 */
export function isInMoveArea(
  move: Pick<MoveDef, 'range' | 'arcDeg'>,
  player: { x: number; z: number; facingYaw: number },
  target: { x: number; z: number; radius: number },
): boolean {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const dist = Math.hypot(dx, dz);
  if (dist > move.range + target.radius) return false;
  if (move.arcDeg >= 360 || dist < target.radius) return true;
  const facing = Math.atan2(dx, dz);
  const diff = Math.atan2(Math.sin(facing - player.facingYaw), Math.cos(facing - player.facingYaw));
  return Math.abs(diff) <= ((move.arcDeg / 2) * Math.PI) / 180;
}

/**
 * 出招時自動轉向（輕度鎖定）：前方 assistDeg 範圍內、距離 range + extra 以內最近的目標；沒有則回傳 null（維持原面向）。
 */
export function assistFacing(
  player: { x: number; z: number; facingYaw: number },
  targets: Iterable<{ x: number; z: number }>,
  range: number,
  assistDeg = 100,
  extra = 1.2,
): number | null {
  let best: number | null = null;
  let bestDist = range + extra;
  for (const t of targets) {
    const dx = t.x - player.x;
    const dz = t.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > bestDist || dist < 1e-3) continue;
    const yaw = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(yaw - player.facingYaw), Math.cos(yaw - player.facingYaw));
    if (Math.abs(diff) > ((assistDeg / 2) * Math.PI) / 180) continue;
    best = yaw;
    bestDist = dist;
  }
  return best;
}
