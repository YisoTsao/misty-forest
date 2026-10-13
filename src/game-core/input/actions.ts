// 輸入動作與按鍵綁定（規格 6.1）。遊戲邏輯只認動作名稱，不認實體按鍵。
import { z } from 'zod';

export const actionIds = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'run',
  'jump',
  'interact',
  'attack',
  'skill',
  'inventory',
  'companion',
  'pause',
] as const;
export type ActionId = (typeof actionIds)[number];

/** 按鍵代碼：KeyboardEvent.code，或滑鼠按鍵 `Mouse0`/`Mouse1`/`Mouse2`。 */
export type Bindings = Record<ActionId, string[]>;

export const bindingsSchema = z.object(
  Object.fromEntries(actionIds.map((id) => [id, z.array(z.string().min(1))])) as Record<ActionId, z.ZodArray<z.ZodString>>,
);

export function parseBindings(raw: unknown): Bindings {
  return bindingsSchema.parse(raw);
}

/**
 * 讀取玩家存的按鍵設定：之後版本新增的動作在舊設定裡不存在，以預設值補上（不讓整份設定失效）。
 * 格式不符時回傳 null。
 */
export function parseSavedBindings(raw: unknown, defaults: Bindings): Bindings | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const merged = { ...defaults, ...(raw as Record<string, unknown>) };
  const parsed = bindingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : null;
}

/** 建立「按鍵代碼 → 動作」反查表；同一按鍵可對應多個動作。 */
export function buildCodeLookup(bindings: Bindings): Map<string, ActionId[]> {
  const lookup = new Map<string, ActionId[]>();
  for (const id of actionIds) {
    for (const code of bindings[id]) {
      const list = lookup.get(code);
      if (list) list.push(id);
      else lookup.set(code, [id]);
    }
  }
  return lookup;
}

/** 由方向動作求移動軸，回傳 [-1,1] 的 right / forward。相反方向同時按下時互相抵消。 */
export function movementAxes(isDown: (action: ActionId) => boolean): { right: number; forward: number } {
  return {
    right: (isDown('moveRight') ? 1 : 0) - (isDown('moveLeft') ? 1 : 0),
    forward: (isDown('moveForward') ? 1 : 0) - (isDown('moveBack') ? 1 : 0),
  };
}

/** 設定畫面可以重新配置的動作。暫停固定為 Esc（同時負責關閉視窗），不開放修改。 */
export const rebindableActions: readonly ActionId[] = actionIds.filter((id) => id !== 'pause');

/** 不允許綁定到任何動作的按鍵：Esc 固定用於暫停與關閉視窗 */
const reservedCodes = new Set(['Escape']);

export type RebindResult = { bindings: Bindings; displaced: ActionId[] } | { error: 'reserved' | 'not-rebindable' | 'last-key' };

/**
 * 把 action 的第 slot 個按鍵（0 主要、1 次要）設為 code；code 為 null 時清除該格（不能清掉最後一個按鍵）。
 * 同一個按鍵若已被其他動作使用，會從那些動作移除（回傳 displaced），避免一鍵觸發兩個動作。
 * 結果會往前補齊：清除主要按鍵時，次要按鍵成為主要。
 */
export function rebind(bindings: Bindings, action: ActionId, slot: 0 | 1, code: string | null): RebindResult {
  if (!rebindableActions.includes(action)) return { error: 'not-rebindable' };
  if (code !== null && reservedCodes.has(code)) return { error: 'reserved' };

  const slots: (string | null)[] = [bindings[action][0] ?? null, bindings[action][1] ?? null];
  if (code !== null) slots.forEach((c, i) => c === code && (slots[i] = null));
  slots[slot] = code;
  const own = slots.filter((c): c is string => c !== null);
  if (own.length === 0) return { error: 'last-key' };

  const next = Object.fromEntries(actionIds.map((id) => [id, [...bindings[id]]])) as Bindings;
  const displaced: ActionId[] = [];
  if (code !== null) {
    for (const id of actionIds) {
      if (id === action || !next[id].includes(code)) continue;
      next[id] = next[id].filter((c) => c !== code);
      displaced.push(id);
    }
  }
  next[action] = own;
  return { bindings: next, displaced };
}
