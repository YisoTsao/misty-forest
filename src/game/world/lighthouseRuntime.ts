// 晨曦燈塔（任務 7D，Bible §5.3、§5.6）：燈塔點亮的那一刻，金色光線從塔頂擴散、沿地面流過谷地，芽芽說話。
// 淨化迷霧核心時的光。只讀權威層事件，不改狀態。
import { terrainHeight } from '@/game-core/world/terrain';
import { authority, worldIndex } from '../authority';
import { companionSay } from '../companion/companionRuntime';
import { useUiStore } from '../state/uiStore';
import { vfx } from '../vfx/vfxQueue';

/** 塔頂燈籠室的 placement（點亮 = 修好） */
export const LIGHTHOUSE_LAMP = 'highland_lighthouse_lamp';
/** 燈塔旁的迷霧核心 */
export const MIST_CORE = 'highland_mist_core';

const GOLD = [1, 0.85, 0.5] as const;

/** 畫面狀態（除錯與測試）：光柱是否已建立 */
export const lighthouseVisual = { beam: false };

function at(id: string): [number, number, number] | null {
  return worldIndex.placement(id)?.position ?? null;
}

export function installLighthouseRuntime(): void {
  authority.subscribe((events, state) => {
    for (const e of events) {
      if (e.type === 'ObjectRepaired' && e.placementId === LIGHTHOUSE_LAMP) {
        const p = at(LIGHTHOUSE_LAMP);
        if (!p) continue;
        const [x, y, z] = p;
        const ground = terrainHeight(x, z);
        vfx({ type: 'flash', x, y: y + 1, z, color: GOLD, intensity: 10, duration: 2.4, distance: 60 });
        vfx({ type: 'burst', preset: 'purify', x, y: y + 1, z, color: GOLD, scale: 3 });
        // 金色光線沿地面流過谷地（兩圈，第二圈更大）
        vfx({ type: 'shockwave', x, y: ground + 0.3, z, radius: 40, duration: 2.2, color: GOLD });
        vfx({ type: 'shockwave', x, y: ground + 0.3, z, radius: 90, duration: 4, color: GOLD });
        useUiStore.getState().pushToast({ textKey: 'toast.lighthouseLit' });
        if (state.companion.unlocked) companionSay('companion.lighthouse');
      } else if (e.type === 'ObjectActivated' && e.placementId === MIST_CORE) {
        const p = at(MIST_CORE);
        if (!p) continue;
        const [x, y, z] = p;
        vfx({ type: 'burst', preset: 'purify', x, y: y + 1.2, z, color: GOLD, scale: 1.8 });
        vfx({ type: 'shockwave', x, y: y + 0.2, z, radius: 8, duration: 1.2, color: GOLD });
      }
    }
  });
}
