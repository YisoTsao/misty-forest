// 手機觸控操作（使用者 2026-10-20：「要支援手機版遊玩，用虛擬搖桿，支援橫向跟直向」）的換算。純函式。
// 左半邊：手指按下的位置就是搖桿中心（浮動搖桿），拖離中心的方向與距離決定移動；推到外圈就跑步。
// 右半邊：拖曳轉視角；雙指張合縮放鏡頭。

/** 搖桿的有效半徑（CSS 像素）：拖到這個距離就是推到底 */
export const JOYSTICK_RADIUS = 56;
/** 中心附近不動的範圍（推到底的比例） */
export const JOYSTICK_DEADZONE = 0.14;
/** 推到這個比例以上就跑步 */
export const JOYSTICK_RUN = 0.88;
/** 觸控拖曳 1 像素等於幾個滑鼠像素（跟隨相機的靈敏度為 0.0025 弧度 / 滑鼠像素；手指一次拖得比較短） */
export const TOUCH_LOOK_SCALE = 1.6;
/** 雙指距離每改變這麼多像素算一格滾輪 */
export const PINCH_STEP = 36;

export type TouchMove = { right: number; forward: number; run: boolean };

/**
 * 手指相對搖桿中心的位移（螢幕座標：+x 向右、+y 向下）→ 移動軸。
 * 長度超過半徑時以推到底計算；中心附近不動；往上推是往前走。
 */
export function joystickMove(dx: number, dy: number, radius = JOYSTICK_RADIUS): TouchMove {
  const len = Math.hypot(dx, dy);
  const ratio = Math.min(1, len / radius);
  if (ratio <= JOYSTICK_DEADZONE || len === 0) return { right: 0, forward: 0, run: false };
  // 去掉死區後重新拉回 0–1，輕推也能慢慢走
  const strength = (ratio - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);
  return { right: (dx / len) * strength, forward: (-dy / len) * strength, run: ratio >= JOYSTICK_RUN };
}

/** 搖桿頭的顯示位置（拖超過半徑時停在外圈） */
export function joystickKnob(dx: number, dy: number, radius = JOYSTICK_RADIUS): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return { x: dx, y: dy };
  return { x: (dx / len) * radius, y: (dy / len) * radius };
}

/** 觸控拖曳的位移 → 相機要的滑鼠像素 */
export function touchLook(dx: number, dy: number): { dx: number; dy: number } {
  return { dx: dx * TOUCH_LOOK_SCALE, dy: dy * TOUCH_LOOK_SCALE };
}

/**
 * 雙指張合 → 滾輪格數（與滑鼠滾輪同方向：正數拉遠）。回傳要送出的格數與剩下沒用完的累積量。
 * 手指張開（距離變大）= 拉近（負數）。
 */
export function pinchZoom(previousDistance: number, distance: number, carry = 0): { steps: number; carry: number } {
  const total = carry + (previousDistance - distance);
  const steps = Math.trunc(total / PINCH_STEP);
  return { steps, carry: total - steps * PINCH_STEP };
}

/** 觸控按鈕送出的按鍵代碼（讓以鍵盤事件處理的選單也能判斷，與手把的 Pad<n> 相同的做法） */
export function touchCode(action: string): string {
  return `Touch:${action}`;
}
