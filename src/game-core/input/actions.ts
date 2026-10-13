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
