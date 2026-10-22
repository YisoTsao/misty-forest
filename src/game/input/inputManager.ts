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
import { touchCode, type TouchMove } from '@/game-core/input/touch';
import { setInputDevice, useInputDeviceStore } from './device';
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
 * 觸控（手機版）：畫面上的虛擬搖桿與按鈕（ui/TouchControls）呼叫 setTouchMove / touchTap / addTouchLook / addTouchZoom；
 * 按鈕和手把一樣送出一次按鍵事件（代碼 Touch:<動作>），讓以 isBound 判斷的選單也能用。
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
  private touchMove: TouchMove = { right: 0, forward: 0, run: false };
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
    if (code === touchCode(action)) return true;
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
    // 觸控：搖桿推到外圈就是跑步
    if (action === 'run' && this.touchMove.run) return true;
    return false;
  }

  /** 移動軸：有按方向鍵時用鍵盤（-1 / 0 / 1），否則用手把左搖桿，再否則用觸控搖桿（都是類比，輕推慢走） */
  moveAxes(): { right: number; forward: number } {
    const keys = movementAxes((a) => this.isDown(a));
    if (keys.right !== 0 || keys.forward !== 0) return keys;
    if (this.padMove.right !== 0 || this.padMove.forward !== 0) return { ...this.padMove };
    return { right: this.touchMove.right, forward: this.touchMove.forward };
  }

  /** 觸控搖桿目前的推動（放開時傳 null） */
  setTouchMove(move: TouchMove | null): void {
    this.touchMove = move ?? { right: 0, forward: 0, run: false };
    if (move) setInputDevice('touch');
  }

  /** 觸控按鈕按下：與手把按鈕相同，算一次按下並送出按鍵事件（代碼 Touch:<動作>） */
  touchTap(action: ActionId): void {
    setInputDevice('touch');
    if (!this.uiMode()) this.pressedSinceConsume.add(action);
    dispatchKey(touchCode(action));
  }

  /** 觸控按鈕直接送出一個按鍵（暫停鈕送 Escape、聊天鈕送 Enter） */
  touchKey(code: string): void {
    setInputDevice('touch');
    dispatchKey(code);
  }

  /** 觸控拖曳轉視角（已換算成滑鼠像素） */
  addTouchLook(dx: number, dy: number): void {
    setInputDevice('touch');
    this.lookDx = Math.max(-LOOK_CAP, Math.min(LOOK_CAP, this.lookDx + dx));
    this.lookDy = Math.max(-LOOK_CAP, Math.min(LOOK_CAP, this.lookDy + dy));
  }

  /** 雙指縮放（與滾輪相同的格數） */
  addTouchZoom(steps: number): void {
    this.zoom += steps;
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
    // 觸控裝置不鎖定（手機瀏覽器沒有滑鼠鎖定，視角改用拖曳）
    if (!this.target || this.pointerLocked || useInputDeviceStore.getState().device === 'touch') return;
    // iOS Safari 等瀏覽器沒有 Pointer Lock API（元素上沒有這個方法），直接不鎖定（手機版本來就用觸控）
    if (typeof this.target.requestPointerLock !== 'function') return;
    try {
      // 使用者快速連點或視窗未聚焦時瀏覽器會拒絕；屬預期情況，下次點擊再試
      const pending: Promise<void> | undefined = this.target.requestPointerLock();
      pending?.catch((err: unknown) => console.warn('[input] 無法鎖定滑鼠：', err));
    } catch (err) {
      console.warn('[input] 無法鎖定滑鼠：', err);
    }
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
    // 在輸入框打字（聊天、名稱）不是遊戲操作；空白鍵也要能打出空白
    if (isTextField(e.target)) return;
    if (!this.lookup.has(e.code)) return;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.press(e.code);
  };

  /** 放開所有按住的鍵（打開聊天時：之後的 keyup 送到輸入框，角色不會一直走） */
  releaseAll(): void {
    this.onBlur();
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    this.downCodes.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    // 觸控螢幕在點擊後補送的相容滑鼠事件（sourceCapabilities.firesTouchEvents）不算滑鼠操作
    if ((e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) return;
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
    this.touchMove = { right: 0, forward: 0, run: false };
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

/** 事件來自可以打字的元素（聊天輸入列、名稱欄） */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}
