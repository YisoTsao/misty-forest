// 地圖邊界的本機暫態（GAME_DESIGN 5.1）：靠近邊界的提示狀態與除錯資訊。不存檔。
import { BOUNDARY_WARN_DISTANCE, boundaryDistance } from '@/game-core/world/bounds';
import { companionSay } from '../companion/companionRuntime';
import { useGameStateStore } from '../state/gameStateStore';
import { useUiStore } from '../state/uiStore';

/** 離開邊界後至少隔這麼久才再提示（秒） */
const WARN_COOLDOWN = 8;

export const boundaryRuntime = {
  /** 已建立的邊界碰撞體數量（除錯與測試用） */
  colliders: 0,
  /** 玩家到邊界的距離（m，界內為正） */
  distance: Infinity,
  /** 目前是否在提示範圍內 */
  near: false,
  /** 已提示次數 */
  warnings: 0,
  /** 上次提示的時間（秒，performance.now 換算） */
  lastWarnAt: -Infinity,
};

/** 每 0.25 秒呼叫：進入提示範圍時顯示一次提示（芽芽已同行時由芽芽說）。 */
export function updateBoundaryWarning(x: number, z: number, nowSec: number): void {
  const distance = boundaryDistance(x, z);
  boundaryRuntime.distance = distance;
  const near = distance < BOUNDARY_WARN_DISTANCE;
  if (near && !boundaryRuntime.near && nowSec - boundaryRuntime.lastWarnAt >= WARN_COOLDOWN) {
    boundaryRuntime.warnings++;
    boundaryRuntime.lastWarnAt = nowSec;
    useUiStore.getState().pushToast({ textKey: 'boundary.hint' });
    if (useGameStateStore.getState().state.companion.unlocked) companionSay('boundary.companion');
  }
  boundaryRuntime.near = near;
}

/** 離開戶外（進室內、回主選單）時重設，下次靠近邊界會重新判斷 */
export function resetBoundaryWarning(): void {
  boundaryRuntime.near = false;
  boundaryRuntime.distance = Infinity;
}
