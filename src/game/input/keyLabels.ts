import type { ActionId, Bindings } from '@/game-core/input/actions';
import { t } from '../i18n';

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

/** 動作的主要按鍵名稱；未設定時回傳「未設定」 */
export function actionKey(bindings: Bindings, action: ActionId): string {
  const code = bindings[action][0];
  return code ? keyLabel(code) : t('key.unbound');
}

/** 提示文字使用的按鍵變數：{move}（WASD 四鍵）、{run}、{jump}、{interact}、{inventory}… */
export function keyVars(bindings: Bindings): Record<string, string> {
  const dirs = (['moveForward', 'moveLeft', 'moveBack', 'moveRight'] as const).map((a) => actionKey(bindings, a));
  // 四個方向都是單一字母時連在一起（WASD），否則以斜線分隔
  const move = dirs.every((d) => d.length === 1) ? dirs.join(' ') : dirs.join(' / ');
  return {
    move,
    run: actionKey(bindings, 'run'),
    jump: actionKey(bindings, 'jump'),
    interact: actionKey(bindings, 'interact'),
    inventory: actionKey(bindings, 'inventory'),
    attack: actionKey(bindings, 'attack'),
    skill: actionKey(bindings, 'skill'),
    companion: actionKey(bindings, 'companion'),
    build: actionKey(bindings, 'build'),
    rotate: actionKey(bindings, 'rotate'),
  };
}
