import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { input } from '@/game/input/inputManager';
import { currentScreen } from '@/game/state/gameStore';
import { isModalOpen } from '@/game/state/uiStore';

/** 把輸入層掛到 Canvas 元素上（滑鼠鎖定、滾輪以 canvas 為目標）。 */
export function InputBinder() {
  const element = useThree((s) => s.gl.domElement);
  useEffect(() => {
    // 手把：主選單、暫停或任何視窗開啟時改為選單導覽
    input.setUiModeProvider(() => currentScreen() !== 'playing' || isModalOpen());
    return input.attach(element);
  }, [element]);
  return null;
}
