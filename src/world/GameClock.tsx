import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';

/** 送出時間前進指令的間隔（秒）：重生計時不需要逐幀精度 */
const TICK_INTERVAL = 1;

/**
 * 遊戲時間：只在遊玩中前進（主選單與暫停時停止），每秒以指令通知權威層，
 * 由規則決定哪些物件重生。
 */
export function GameClock() {
  const acc = useMemo(() => ({ dt: 0 }), []);
  useFrame((_, dt) => {
    if (!isControllable(currentScreen())) return;
    // 分頁切走後回來的第一幀可能很長，限制單幀最多 0.25 秒
    acc.dt += Math.min(dt, 0.25);
    if (acc.dt < TICK_INTERVAL) return;
    const { x, z } = playerRuntime.position;
    authority.send({ type: 'AdvanceTime', dt: acc.dt, player: { x, z } });
    acc.dt = 0;
  });
  return null;
}
