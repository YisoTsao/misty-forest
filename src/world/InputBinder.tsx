import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { input } from '@/game/input/inputManager';

/** 把輸入層掛到 Canvas 元素上（滑鼠鎖定、滾輪以 canvas 為目標）。 */
export function InputBinder() {
  const element = useThree((s) => s.gl.domElement);
  useEffect(() => input.attach(element), [element]);
  return null;
}
