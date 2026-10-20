import padBindingsData from '@/data/gamepad.json';
import type { ActionId, Bindings } from '@/game-core/input/actions';
import { parsePadBindings } from '@/game-core/input/gamepad';
import { hasText, t } from '../i18n';
import { useInputDeviceStore } from './device';

const padBindings = parsePadBindings(padBindingsData);
/** standard mapping 的按鈕名稱（Xbox 標示） */
const padNames = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3'];
const padDpad = ['key.padUp', 'key.padDown', 'key.padLeft', 'key.padRight'];

/** 手把按鈕編號 → 顯示用名稱 */
export function padLabel(button: number): string {
  return padNames[button] ?? (padDpad[button - 12] ? t(padDpad[button - 12]!) : `Pad ${button}`);
}

const special: Record<string, string> = {
  Space: 'key.space',
  ShiftLeft: 'key.shiftLeft',
  ShiftRight: 'key.shiftRight',
  ControlLeft: 'key.ctrlLeft',
  ControlRight: 'key.ctrlRight',
  AltLeft: 'key.altLeft',
  AltRight: 'key.altRight',
  MetaLeft: 'key.metaLeft',
  MetaRight: 'key.metaRight',
  Tab: 'key.tab',
  Enter: 'key.enter',
  Backspace: 'key.backspace',
  CapsLock: 'key.capsLock',
  Escape: 'key.escape',
  ArrowUp: 'key.arrowUp',
  ArrowDown: 'key.arrowDown',
  ArrowLeft: 'key.arrowLeft',
  ArrowRight: 'key.arrowRight',
  Mouse0: 'key.mouse0',
  Mouse1: 'key.mouse1',
  Mouse2: 'key.mouse2',
};

/** KeyboardEvent.code / Mouse<n> → 顯示用名稱（KeyW → W、Digit1 → 1、Space → 空白鍵） */
export function keyLabel(code: string): string {
  if (special[code]) return t(special[code]);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `${t('key.numpad')} ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Mouse\d$/.test(code)) return `${t('key.mouse')} ${code.slice(5)}`;
  return code;
}

/** 動作的主要按鍵名稱；最近使用手把時顯示手把按鈕。未設定時回傳「未設定」 */
export function actionKey(bindings: Bindings, action: ActionId): string {
  // 手機版（任務 11M）：顯示畫面上的觸控按鈕
  if (useInputDeviceStore.getState().device === 'touch' && hasText(`touch.key.${action}`)) return t(`touch.key.${action}`);
  const pad = padBindings[action]?.[0];
  if (useInputDeviceStore.getState().device === 'gamepad' && pad !== undefined) return padLabel(pad);
  const code = bindings[action][0];
  return code ? keyLabel(code) : t('key.unbound');
}

/** 提示文字使用的按鍵變數：{move}（WASD 四鍵）、{run}、{jump}、{interact}、{inventory}… */
export function keyVars(bindings: Bindings): Record<string, string> {
  const dirs = (['moveForward', 'moveLeft', 'moveBack', 'moveRight'] as const).map((a) => actionKey(bindings, a));
  // 四個方向都是單一字母時連在一起（WASD），否則以斜線分隔
  const device = useInputDeviceStore.getState().device;
  const move =
    device === 'gamepad'
      ? t('key.padStick')
      : device === 'touch'
        ? t('touch.key.move')
      : dirs.every((d) => d.length === 1)
        ? dirs.join(' ')
        : dirs.join(' / ');
  return {
    move,
    run: actionKey(bindings, 'run'),
    jump: actionKey(bindings, 'jump'),
    interact: actionKey(bindings, 'interact'),
    inventory: actionKey(bindings, 'inventory'),
    attack: actionKey(bindings, 'attack'),
    heavy: actionKey(bindings, 'heavyAttack'),
    // 手把以「切換武器」依序切換；鍵盤列出三把武器的按鍵（V 也可依序切換）
    weapons:
      device !== 'keyboard'
        ? actionKey(bindings, 'cycleWeapon')
        : (['weapon1', 'weapon2', 'weapon3'] as const).map((a) => actionKey(bindings, a)).join(' '),
    skill: actionKey(bindings, 'skill'),
    spell2: actionKey(bindings, 'spell2'),
    spell3: actionKey(bindings, 'spell3'),
    companion: actionKey(bindings, 'companion'),
    build: actionKey(bindings, 'build'),
    rotate: actionKey(bindings, 'rotate'),
    map: actionKey(bindings, 'map'),
    journal: actionKey(bindings, 'journal'),
    quickHeal: actionKey(bindings, 'quickHeal'),
    pause: device === 'gamepad' ? 'Menu' : device === 'touch' ? t('touch.key.pause') : t('key.escape'),
  };
}
