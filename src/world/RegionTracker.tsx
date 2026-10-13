import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { regionAt } from '@/game-core/world/regions';
import { regions } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { onRegionChanged } from '@/game/session';
import { currentScreen } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';

const CHECK_INTERVAL = 0.5;

/** 每 0.5 秒判斷玩家所在區域；改變時更新 UI（區域名稱）並觸發自動存檔（規格 6.8：區域切換）。 */
export function RegionTracker() {
  const local = useMemo(() => ({ since: 0 }), []);
  useFrame((_, dt) => {
    if (currentScreen() === 'title') return;
    local.since += dt;
    if (local.since < CHECK_INTERVAL) return;
    local.since = 0;
    const region = regionAt(regions, playerRuntime.position.x, playerRuntime.position.z);
    const ui = useUiStore.getState();
    if (region === ui.currentRegion) return;
    ui.setCurrentRegion(region);
    onRegionChanged();
  });
  return null;
}
