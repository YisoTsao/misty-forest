import keybindings from '@/data/keybindings.json';
import padBindings from '@/data/gamepad.json';
import { buildCodeLookup, movementAxes, parseBindings, type ActionId, type Bindings } from '@/game-core/input/actions';
import {
  applyDeadzone,
  buildPadLookup,
  initialNavRepeat,
  navDirection,
  PAD,
  PAD_BUTTON_COUNT,
  padCode,
  parsePadBindings,
  PRESS_THRESHOLD,
  stepNavRepeat,
  stickToMove,
} from '@/game-core/input/gamepad';
import { setInputDevice } from './device';
import { activateFocused, clearPadFocus, focusNext } from './padUi';

/** 手把一幀的狀態（按鈕 0–1、搖桿 -1–1，standard mapping） */
export type PadSnapshot = { buttons: readonly number[]; axes: readonly number[] };

/** 右搖桿推到底時的視角速度，換算成滑鼠像素（FollowCamera 的靈敏度為 0.0025 弧度 / 像素）：約 2.6 / 1.6 弧度每秒 */
const PAD_LOOK_X = 1040;
const PAD_LOOK_Y = 640;
/** 視角不在跟隨模式時（自由視角）不會被讀取，累積上限避免切回時突然轉一大圈 */
const LOOK_CAP = 400;

function readNavigatorPad(): PadSnapshot | null {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const pad = [...pads].find((p) => p?.connected);
  return pad ? { buttons: pad.buttons.map((b) => b.value), axes: pad.axes } : null;
}

/**
 * 輸入層（規格 6.1）：把鍵盤 / 滑鼠事件轉成「動作」狀態。
 * 遊戲邏輯在 useFrame 內輪詢，不經過 React state。
 * 手把（任務 5C）：每幀輪詢 Gamepad API；遊玩中按鈕對應動作（`data/gamepad.json`）、左搖桿移動、右搖桿視角，
 * 選單開啟時改為選單導覽（十字鍵 / 左搖桿選按鈕、A 確認、B 返回），Start 固定為暫停（等同 Esc）。
 */
class InputManager {
  private lookup = new Map<string, ActionId[]>();
  private downCodes = new Set<string>();
  private pressedSinceConsume = new Set<ActionId>();
  private lookDx = 0;
  private lookDy = 0;
  private zoom = 0;
  private target: HTMLElement | null = null;
  private pointerLockEnabled = false;
  private padLookup = buildPadLookup(parsePadBindings(padBindings));
  private padHeld = new Set<number>();
  private padMove = { right: 0, forward: 0 };
  private padOverride: PadSnapshot | null = null;
  private nav = initialNavRepeat();
  private wasUi = false;
  private lastPoll = 0;
  private rafId = 0;
  /** 是否處於選單操作（主選單、暫停、對話、背包等），由 InputBinder 提供 */
  private uiMode: () => boolean = () => false;

  constructor(bindings: Bindings) {
    this.setBindings(bindings);
  }

  /** 重新配置按鍵（設定選單於 Phase 2 使用）。 */
  setBindings(bindings: Bindings): void {
    this.lookup = buildCodeLookup(bindings);
    this.downCodes.clear();
    this.pressedSinceConsume.clear();
  }

  attach(target: HTMLElement): () => void {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    const loop = (now: number) => {
      this.pollGamepad(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(this.rafId);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
      target.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('mouseup', this.onMouseUp);
      window.removeEventListener('mousemove', this.onMouseMove);
      target.removeEventListener('wheel', this.onWheel);
      this.target = null;
      this.onBlur();
    };
  }

  /** 這個按鍵代碼（含手把的 Pad<n>）是否綁定到指定動作（UI 以鍵盤事件直接處理的動作使用，例如開關背包）。 */
  isBound(code: string, action: ActionId): boolean {
    if (this.lookup.get(code)?.includes(action)) return true;
    const pad = /^Pad(\d+)$/.exec(code)?.[1];
    return pad !== undefined && this.padLookup.get(Number(pad))?.includes(action) === true;
  }

  isDown(action: ActionId): boolean {
    for (const code of this.downCodes) {
      if (this.lookup.get(code)?.includes(action)) return true;
    }
    for (const b of this.padHeld) {
      if (this.padLookup.get(b)?.includes(action)) return true;
    }
    return false;
  }

  /** 移動軸：有按方向鍵時用鍵盤（-1 / 0 / 1），否則用左搖桿（類比，輕推慢走） */
  moveAxes(): { right: number; forward: number } {
    const keys = movementAxes((a) => this.isDown(a));
    return keys.right !== 0 || keys.forward !== 0 ? keys : { ...this.padMove };
  }

  /** 選單操作狀態的來源（InputBinder 設定） */
  setUiModeProvider(fn: () => boolean): void {
    this.uiMode = fn;
  }

  /** 除錯 / 端對端測試：以模擬的手把狀態取代 Gamepad API（null 還原） */
  setPadOverride(pad: PadSnapshot | null): void {
    this.padOverride = pad;
  }

  /** 自上次呼叫以來是否按下過（邊緣觸發，讀取後清除）。 */
  consumePressed(action: ActionId): boolean {
    const was = this.pressedSinceConsume.has(action);
    this.pressedSinceConsume.delete(action);
    return was;
  }

  /** 取出累積的滑鼠視角位移（像素）。只有在滑鼠鎖定時才會累積。 */
  consumeLook(): { dx: number; dy: number } {
    const out = { dx: this.lookDx, dy: this.lookDy };
    this.lookDx = 0;
    this.lookDy = 0;
    return out;
  }

  consumeZoom(): number {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  get pointerLocked(): boolean {
    return this.target !== null && document.pointerLockElement === this.target;
  }

  /** 跟隨相機啟用時才允許點擊鎖定滑鼠；自由視角（OrbitControls）需要一般游標。 */
  setPointerLockEnabled(enabled: boolean): void {
    this.pointerLockEnabled = enabled;
    if (!enabled && this.pointerLocked) document.exitPointerLock();
  }

  requestPointerLock(): void {
    if (!this.target || this.pointerLocked) return;
    // 使用者快速連點或視窗未聚焦時瀏覽器會拒絕；屬預期情況，下次點擊再試
    this.target.requestPointerLock().catch((err: unknown) => console.warn('[input] 無法鎖定滑鼠：', err));
  }

  /**
   * 除錯 / 端對端測試：模擬按下並放開一個按鍵代碼（經過與真實輸入相同的綁定查表）。
   * 自動化環境常無法鎖定滑鼠，滑鼠左鍵的第一下會被拿去鎖定，需要以此觸發攻擊。
   */
  injectTap(code: string): void {
    this.press(code);
    this.downCodes.delete(code);
  }

  private press(code: string): void {
    if (this.downCodes.has(code)) return; // 忽略按住時的重複事件
    this.downCodes.add(code);
    for (const action of this.lookup.get(code) ?? []) this.pressedSinceConsume.add(action);
  }

  private pollGamepad(now: number): void {
    const dt = this.lastPoll ? Math.min(0.1, (now - this.lastPoll) / 1000) : 0;
    this.lastPoll = now;
    const pad = this.padOverride ?? readNavigatorPad();
    if (!pad) {
      this.padHeld.clear();
      this.padMove = { right: 0, forward: 0 };
      return;
    }
    const pressed = (b: number) => (pad.buttons[b] ?? 0) >= PRESS_THRESHOLD;
    const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
    const ui = this.uiMode();
    if (this.wasUi && !ui) clearPadFocus();
    this.wasUi = ui;

    let active = false;
    for (let b = 0; b < PAD_BUTTON_COUNT; b++) {
      const down = pressed(b);
      if (down) active = true;
      if (down && !this.padHeld.has(b)) {
        this.padHeld.add(b);
        this.onPadButton(b, ui);
      } else if (!down) this.padHeld.delete(b);
    }

    const look = applyDeadzone(rx, ry);
    if (ui) {
      this.padMove = { right: 0, forward: 0 };
      const repeat = stepNavRepeat(this.nav, navDirection(pressed, lx, ly), dt);
      this.nav = repeat.state;
      if (repeat.fire) focusNext(repeat.fire);
    } else {
      this.nav = initialNavRepeat();
      this.padMove = stickToMove(lx, ly);
      this.lookDx = Math.max(-LOOK_CAP, Math.min(LOOK_CAP, this.lookDx + look.x * PAD_LOOK_X * dt));
      this.lookDy = Math.max(-LOOK_CAP, Math.min(LOOK_CAP, this.lookDy + look.y * PAD_LOOK_Y * dt));
    }
    if (active || this.padMove.right !== 0 || this.padMove.forward !== 0 || look.x !== 0 || look.y !== 0) setInputDevice('gamepad');
  }

  /** 手把按鈕按下的那一幀 */
  private onPadButton(b: number, ui: boolean): void {
    // Start 固定為暫停 / 關閉視窗，與 Esc 相同
    if (b === PAD.Start) return dispatchKey('Escape');
    if (ui) {
      if (b === PAD.A) {
        if (!activateFocused()) dispatchKey('Enter');
        return;
      }
      if (b === PAD.B) return dispatchKey('Escape');
      // 其他按鈕交給以 isBound 判斷的選單（例如再按一次 Back 關閉背包、Y 翻頁對話）
      return dispatchKey(padCode(b));
    }
    for (const action of this.padLookup.get(b) ?? []) this.pressedSinceConsume.add(action);
    dispatchKey(padCode(b));
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.isTrusted) setInputDevice('keyboard');
    if (!this.lookup.has(e.code)) return;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.downCodes.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.isTrusted) setInputDevice('keyboard');
    if (this.pointerLockEnabled && !this.pointerLocked) {
      this.requestPointerLock();
      return; // 第一次點擊只用來鎖定滑鼠，不觸發攻擊
    }
    this.press(`Mouse${e.button}`);
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.downCodes.delete(`Mouse${e.button}`);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerLocked) return;
    this.lookDx += e.movementX;
    this.lookDy += e.movementY;
  };

  private onWheel = (e: WheelEvent): void => {
    this.zoom += Math.sign(e.deltaY);
  };

  /** 視窗失焦時放開所有按鍵，避免角色卡在持續移動。 */
  private onBlur = (): void => {
    this.downCodes.clear();
    this.pressedSinceConsume.clear();
    this.lookDx = 0;
    this.lookDy = 0;
  };
}

/** 送出一次按下 / 放開的鍵盤事件，讓以 keydown 處理的選單也能用手把操作 */
function dispatchKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

export const input = new InputManager(parseBindings(keybindings));
