import { useFrame } from '@react-three/fiber';
import { currentTimeLook, nightAmount } from '@/render/timeLook';
import { windowGlowUniforms } from '@/render/windowGlow';

/** 村屋窗燈的亮度（任務 7N）：白天 0、入夜漸亮、深夜 1 */
export function WindowGlowDriver() {
  useFrame(() => {
    windowGlowUniforms.uWindowGlow.value = nightAmount(currentTimeLook);
  });
  return null;
}
