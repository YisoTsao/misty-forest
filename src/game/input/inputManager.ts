import keybindings from '@/data/keybindings.json';
import { buildCodeLookup, parseBindings, type ActionId, type Bindings } from '@/game-core/input/actions';

/**
 * 輸入層（規格 6.1）：把鍵盤 / 滑鼠事件轉成「動作」狀態。
 * 遊戲邏輯在 useFrame 內輪詢，不經過 React state。
 * 預留手把：之後只需在這裡加入 Gamepad 來源。
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
    return () => {
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

  isDown(action: ActionId): boolean {
    for (const code of this.downCodes) {
      if (this.lookup.get(code)?.includes(action)) return true;
    }
    return false;
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

  private press(code: string): void {
    if (this.downCodes.has(code)) return; // 忽略按住時的重複事件
    this.downCodes.add(code);
    for (const action of this.lookup.get(code) ?? []) this.pressedSinceConsume.add(action);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.lookup.has(e.code)) return;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.downCodes.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
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

export const input = new InputManager(parseBindings(keybindings));
