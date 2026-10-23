import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { regionAt } from '@/game-core/world/regions';
import { authority, regions } from '@/game/authority';
import { playerRuntime } from '@/game/player/localRuntime';
import { currentInterior } from '@/game/location';
import { onRegionChanged } from '@/game/session';
import { currentScreen } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';

const CHECK_INTERVAL = 0.5;
/** 濃霧裡每隔多久扣一次血（第二章 Phase 3，只有迷霧深層） */
const MIST_HARM_INTERVAL = 2;

/** 每 0.5 秒判斷玩家所在區域；改變時更新 UI（區域名稱）並觸發自動存檔（規格 6.8：區域切換）。 */
export function RegionTracker() {
  const local = useMemo(() => ({ since: 0, harm: 0 }), []);
  useFrame((_, dt) => {
    if (currentScreen() === 'title') return;
    local.since += dt;
    if (local.since < CHECK_INTERVAL) return;
    local.since = 0;
    // 室內子場景：維持進門前的區域（不顯示區域名稱、不觸發存檔）
    if (currentInterior()) return;
    const region = regionAt(regions, playerRuntime.position.x, playerRuntime.position.z);
    // 迷霧持續傷害（第二章 Phase 3）：濃霧裡累積時間，到了間隔就送出指令；哪些區域會扣血由權威層決定
    if (authority.getState().mist[region] === 'dense') {
      local.harm += CHECK_INTERVAL;
      if (local.harm >= MIST_HARM_INTERVAL) {
        local.harm = 0;
        authority.send({ type: 'MistHarm', region });
      }
    } else {
      local.harm = 0;
    }
    const ui = useUiStore.getState();
    if (region === ui.currentRegion) return;
    ui.setCurrentRegion(region);
    onRegionChanged();
  });
  return null;
}
