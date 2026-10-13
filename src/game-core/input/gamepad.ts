// 手把輸入（規格 6.1：輸入層與邏輯解耦；手把 P1）。依 Gamepad API 的 standard mapping，純函式不碰瀏覽器 API。
import { z } from 'zod';
import { actionIds, type ActionId } from './actions';

/** standard mapping 的按鈕編號 */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Back: 8,
  Start: 9,
  L3: 10,
  R3: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;
export const PAD_BUTTON_COUNT = 16;

/** 手把按鈕的代碼（與鍵盤的 KeyboardEvent.code 同一個命名空間，UI 的 isBound 也能辨識） */
export const padCode = (button: number): string => `Pad${button}`;

/** 動作 → 手把按鈕編號。移動與視角由搖桿負責；暫停固定為 Start（選單中 B 為返回）。 */
export type PadBindings = Partial<Record<ActionId, number[]>>;

export const padBindingsSchema = z
  .record(z.string(), z.array(z.number().int().min(0).max(PAD_BUTTON_COUNT - 1)))
  .refine((r) => Object.keys(r).every((k) => (actionIds as readonly string[]).includes(k)), { message: '未知的動作' });

export function parsePadBindings(raw: unknown): PadBindings {
  return padBindingsSchema.parse(raw) as PadBindings;
}

/** 按鈕編號 → 動作反查表 */
export function buildPadLookup(bindings: PadBindings): Map<number, ActionId[]> {
  const lookup = new Map<number, ActionId[]>();
  for (const id of actionIds) {
    for (const b of bindings[id] ?? []) {
      const list = lookup.get(b);
      if (list) list.push(id);
      else lookup.set(b, [id]);
    }
  }
  return lookup;
}

/** 搖桿死區：半徑內為 0，之外重新縮放到 0–1（推到底為 1，斜推不超過 1） */
export function applyDeadzone(x: number, y: number, deadzone = 0.2): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/** 左搖桿 → 移動軸（Gamepad API 的 y 往下為正，前進為負） */
export function stickToMove(x: number, y: number): { right: number; forward: number } {
  const s = applyDeadzone(x, y);
  return { right: s.x, forward: -s.y };
}

/** 扳機與按鈕的「按下」門檻（類比扳機輕碰不算） */
export const PRESS_THRESHOLD = 0.5;

export type NavDir = 'up' | 'down' | 'left' | 'right';

/** 選單導覽方向：十字鍵優先，其次左搖桿（推過一半才算） */
export function navDirection(pressed: (button: number) => boolean, stickX: number, stickY: number): NavDir | null {
  if (pressed(PAD.Up)) return 'up';
  if (pressed(PAD.Down)) return 'down';
  if (pressed(PAD.Left)) return 'left';
  if (pressed(PAD.Right)) return 'right';
  if (Math.max(Math.abs(stickX), Math.abs(stickY)) < 0.5) return null;
  if (Math.abs(stickY) >= Math.abs(stickX)) return stickY < 0 ? 'up' : 'down';
  return stickX < 0 ? 'left' : 'right';
}

/** 按住方向時的連續移動：第一次立即、0.4 秒後每 0.12 秒一次 */
export type NavRepeat = { dir: NavDir | null; held: number; next: number };
export const initialNavRepeat = (): NavRepeat => ({ dir: null, held: 0, next: 0 });
export function stepNavRepeat(s: NavRepeat, dir: NavDir | null, dt: number): { state: NavRepeat; fire: NavDir | null } {
  if (dir === null) return { state: initialNavRepeat(), fire: null };
  if (dir !== s.dir) return { state: { dir, held: 0, next: 0.4 }, fire: dir };
  const held = s.held + dt;
  if (held < s.next) return { state: { ...s, held }, fire: null };
  return { state: { dir, held, next: s.next + 0.12 }, fire: dir };
}

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * 空間導覽：從目前的元素往某個方向找下一個。只考慮在該方向上的元素，
 * 以「主軸距離 + 2 × 側向偏移」最小者為準（偏好同一列 / 同一欄）。沒有目前元素時回傳最接近畫面中心者。
 */
export function pickNext(rects: readonly Rect[], current: number | null, dir: NavDir, viewport: { width: number; height: number }): number | null {
  const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  if (current === null || !rects[current]) {
    let best: number | null = null;
    let bestD = Infinity;
    rects.forEach((r, i) => {
      const c = center(r);
      const d = Math.hypot(c.x - viewport.width / 2, c.y - viewport.height / 2);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  }
  const from = center(rects[current]!);
  let best: number | null = null;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === current) return;
    const c = center(r);
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (main <= 1) return;
    const score = main + side * 2;
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  return best;
}
