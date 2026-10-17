import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentScreen } from '@/game/state/gameStore';
import { secondsUntilHour } from '@/game-core/world/timeOfDay';
import { useDebugStore } from '@/game/state/debugStore';
import { updateTimeRuntime } from '@/game/world/timeRuntime';
import { worldClockNow } from '@/game/world/worldClock';

/** 送出時間前進指令的間隔（秒）：重生計時不需要逐幀精度 */
const TICK_INTERVAL = 1;
/** 權威狀態的共享時鐘落後超過這麼多秒就立刻對時（讀檔、從暫停回來、除錯撥時間） */
const CLOCK_DRIFT = 1.5;

/**
 * 遊戲時間：遊玩秒數只在遊玩中前進（主選單與暫停時停止），每秒以指令通知權威層，由規則決定哪些物件重生。
 * 日夜（GAME_DESIGN 5.2）改看共享世界時鐘（使用者 2026-10-17：所有人同一個日夜）：畫面每幀直接讀時鐘，
 * 權威狀態每秒對時一次，夜裡的條件（對話、地窖門）也和大家一致。暫停時太陽照樣移動。
 */
export function GameClock() {
  const acc = useMemo(() => ({ dt: 0, sync: 0 }), []);
  useFrame((_, dt) => {
    const now = worldClockNow();
    if (isControllable(currentScreen())) {
      // 分頁切走後回來的第一幀可能很長，限制單幀最多 0.25 秒
      acc.dt += Math.min(dt, 0.25);
      if (acc.dt >= TICK_INTERVAL) {
        const { x, z } = playerRuntime.position;
        authority.send({ type: 'AdvanceTime', dt: acc.dt, player: { x, z } });
        acc.dt = 0;
      }
    }
    acc.sync += dt;
    if (acc.sync >= TICK_INTERVAL || Math.abs(now - authority.getState().clock) > CLOCK_DRIFT) {
      authority.send({ type: 'SyncClock', clock: now });
      acc.sync = 0;
    }
    const override = useDebugStore.getState().clockOverride;
    // ?clock= 美術驗收：畫面固定在指定時刻（只影響外觀）
    updateTimeRuntime(override === null ? now : secondsUntilHour(0, override));
  });
  return null;
}
