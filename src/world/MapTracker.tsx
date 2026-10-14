import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { syncMapTo } from '@/game/location';
import { playerRuntime } from '@/game/player/localRuntime';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen } from '@/game/state/gameStore';

const CHECK_INTERVAL = 0.25;

/**
 * 依觀看位置更新所在地圖（讀檔、新遊戲、除錯傳送後；走過出入口時 travelToMap 已直接設定）。
 * 與迷霧相同：遊玩中看玩家，主選單與自由視角（攝影機書籤、截圖）看攝影機。
 */
export function MapTracker() {
  const local = useMemo(() => ({ since: 0 }), []);
  useFrame(({ camera }, dt) => {
    local.since += dt;
    if (local.since < CHECK_INTERVAL) return;
    local.since = 0;
    const viewer = useDebugStore.getState().cameraMode === 'follow' && currentScreen() !== 'title' ? playerRuntime.position : camera.position;
    syncMapTo(viewer.x, viewer.z);
  });
  return null;
}
