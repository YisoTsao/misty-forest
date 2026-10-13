// 手把操作選單：以方向挑選按鈕（空間導覽）、A 按下、滑桿左右調整。對所有選單通用，不需要逐一修改元件。
import { pickNext, type NavDir } from '@/game-core/input/gamepad';

const FOCUS_CLASS = 'pad-focus';
const FOCUSABLE = 'button:not([disabled]), input[type="range"]:not([disabled])';

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** 目前最上層的選單（`data-pad-scope`，DOM 順序最後者在最上面）；沒有時為整個畫面 */
function scope(): ParentNode {
  const scopes = [...document.querySelectorAll('[data-pad-scope]')].filter(visible);
  return scopes.at(-1) ?? document;
}

function focusables(): HTMLElement[] {
  return [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

function setFocus(el: HTMLElement): void {
  document.querySelector(`.${FOCUS_CLASS}`)?.classList.remove(FOCUS_CLASS);
  el.classList.add(FOCUS_CLASS);
  el.focus({ preventScroll: false });
}

function current(list: HTMLElement[]): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && list.includes(active) ? active : null;
}

/** 往某個方向移到下一個按鈕；還沒有選取時選最接近畫面中心的 */
export function focusNext(dir: NavDir): void {
  const list = focusables();
  const at = current(list);
  if (at instanceof HTMLInputElement && at.type === 'range' && (dir === 'left' || dir === 'right')) {
    stepSlider(at, dir === 'right' ? 1 : -1);
    return;
  }
  const next = pickNext(
    list.map((el) => el.getBoundingClientRect()),
    at ? list.indexOf(at) : null,
    dir,
    { width: window.innerWidth, height: window.innerHeight },
  );
  if (next !== null) setFocus(list[next]!);
}

/** A：按下目前選取的按鈕。沒有選取時先選一個（不按下），回傳 false 讓呼叫端改送 Enter */
export function activateFocused(): boolean {
  const list = focusables();
  const at = current(list);
  if (at) {
    at.click();
    return true;
  }
  const first = pickNext(
    list.map((el) => el.getBoundingClientRect()),
    null,
    'down',
    { width: window.innerWidth, height: window.innerHeight },
  );
  if (first !== null) setFocus(list[first]!);
  return false;
}

/** 回到遊玩時放開選取，避免之後按空白鍵誤觸按鈕 */
export function clearPadFocus(): void {
  const el = document.querySelector<HTMLElement>(`.${FOCUS_CLASS}`);
  if (!el) return;
  el.classList.remove(FOCUS_CLASS);
  el.blur();
}

function stepSlider(el: HTMLInputElement, sign: 1 | -1): void {
  const step = Number(el.step) || 1;
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const value = Math.min(max, Math.max(min, Number(el.value) + sign * step));
  // React 的受控元件：以原生 setter 設值再送 input 事件，onChange 才會收到
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
