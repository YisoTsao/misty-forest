import { create } from 'zustand';

/** 最近使用的輸入裝置：提示文字依此顯示鍵盤按鍵或手把按鈕 */
export type InputDevice = 'keyboard' | 'gamepad';

export const useInputDeviceStore = create<{ device: InputDevice }>(() => ({ device: 'keyboard' }));

export function setInputDevice(device: InputDevice): void {
  if (useInputDeviceStore.getState().device !== device) useInputDeviceStore.setState({ device });
}
