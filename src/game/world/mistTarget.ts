import { mistLevelAt } from '@/game-core/world/regions';
import { interiorAt } from '@/game-core/world/interiors';
import { authority, interiors, regions } from '../authority';
import { useDebugStore } from '../state/debugStore';

/**
 * 畫面迷霧的目標值：有除錯覆寫時用覆寫值，否則依觀看位置（跟隨時為玩家、自由視角為攝影機）
 * 在各區域的迷霧階段之間混合（規格 4.5：區域邊界以空間位置平滑混合）。
 */
export function mistTargetAt(x: number, z: number): number {
  const override = useDebugStore.getState().mistOverride;
  if (override !== null) return override;
  // 室內沒有霧
  if (interiorAt(interiors, x, z)) return 0;
  return mistLevelAt(regions, authority.getState().mist, x, z);
}
