// 腳步聲（規格 6.9 音效：腳步）：依移動速度決定步伐間隔，依腳下的地面決定音色。純函式。
import { BRIDGE } from '../world/terrain';

export type Surface = 'grass' | 'wood';

/** 走路約每 0.5 秒一步、跑步約每 0.3 秒一步；幾乎靜止時不出聲 */
export function footstepInterval(speed: number): number | null {
  if (speed < 0.6) return null;
  return Math.max(0.26, Math.min(0.55, 1.5 / speed));
}

/** 站在木橋（或之後的木地板）上是木頭聲，其他是草地 */
export function surfaceAt(x: number, z: number, feetY: number): Surface {
  const half = BRIDGE.length / 2;
  const onBridge = Math.abs(x - BRIDGE.x) <= half && Math.abs(z - BRIDGE.z) <= 1.4 && Math.abs(feetY - BRIDGE.deckY) < 0.35;
  return onBridge ? 'wood' : 'grass';
}
