import { create } from 'zustand';

/** 最近使用的輸入裝置：提示文字依此顯示鍵盤按鍵、手把按鈕，或在手機上顯示觸控按鈕（觸控） */
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/**
 * 是否是以觸控為主的裝置（手機、平板）：主要指標是「粗略」的（手指）。網址參數 ?touch=1 可以強制開啟（e2e、桌機上試觸控介面），
 * ?touch=0 強制關閉。
 */
export function isTouchPreferred(): boolean {
  if (typeof window === 'undefined') return false;
  const flag = new URLSearchParams(window.location.search).get('touch');
  if (flag === '1') return true;
  if (flag === '0') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export const useInputDeviceStore = create<{ device: InputDevice }>(() => ({ device: isTouchPreferred() ? 'touch' : 'keyboard' }));

export function setInputDevice(device: InputDevice): void {
  if (useInputDeviceStore.getState().device !== device) useInputDeviceStore.setState({ device });
}

/** 目前是否用觸控介面（HUD 依此改成手機排版、顯示虛擬搖桿與按鈕） */
export function useTouchUi(): boolean {
  return useInputDeviceStore((s) => s.device === 'touch');
}

/**
 * 觸控按鈕在手指按下時就觸發（反應快），但放開後瀏覽器還會補送一次 click，落在按鈕觸發後才出現的東西上
 * （例如按暫停鈕後出現的暫停選單背景，點背景＝繼續；互動後出現的對話框，點一下＝跳過第一句）。
 * 按下時呼叫這個函式，吞掉接下來 0.5 秒內的那一次 click。
 */
export function swallowNextClick(): void {
  if (typeof window === 'undefined') return;
  const swallow = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener('click', swallow, true);
  };
  window.addEventListener('click', swallow, true);
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 500);
}
