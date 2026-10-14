import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { cellIndexAt } from '@/game-core/map/explore';
import { authority } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentInterior } from '@/game/location';
import { currentScreen } from '@/game/state/gameStore';

const CHECK_INTERVAL = 0.4;

/**
 * 世界地圖的探索（任務 7B）：玩家走進新的地圖格子時送出 ExploreArea，權威層紀錄附近看到的格子。
 * 室內與主選單不紀錄；讀檔、新遊戲後第一次檢查一定會送出（玩家所在處立刻是已探索）。
 */
export function MapExplorer() {
  const local = useMemo(() => ({ since: 0, lastCell: -1, lastState: null as unknown }), []);
  useFrame((_, dt) => {
    if (currentScreen() === 'title') return;
    local.since += dt;
    if (local.since < CHECK_INTERVAL) return;
    local.since = 0;
    if (currentInterior()) return;
    const { x, z } = playerRuntime.position;
    const cell = cellIndexAt(x, z);
    if (cell === null) return;
    // 讀檔或新遊戲會整個替換權威狀態：狀態物件換了就重新送一次
    const explored = authority.getState().explored;
    if (cell === local.lastCell && explored === local.lastState) return;
    authority.send({ type: 'ExploreArea', x, z });
    local.lastCell = cell;
    local.lastState = authority.getState().explored;
  });
  return null;
}
