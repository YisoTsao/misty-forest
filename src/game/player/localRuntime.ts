// 本機暫態（規格 3-7）：玩家位置、移動狀態、攝影機角度。
// 每幀由 useFrame 讀寫的可變物件，不放進 React state，也不進存檔
// （玩家位置於 Phase 2 存檔時從這裡取快照）。
import { initialLocomotionState, type LocomotionState } from '@/game-core/character/locomotion';
import type { SafePointTrail } from '@/game-core/world/safePoints';

export const playerRuntime = {
  position: { x: 0, y: 0, z: 0 },
  locomotion: initialLocomotionState(Math.PI) as LocomotionState,
  /** 除錯 / 截圖用：強制播放指定動畫片段並停在片段長度的某個比例（0–1）。 */
  animPreview: null as { clip: string; fraction: number } | null,
  /** 開始新遊戲：下一幀回到出生點、清除安全點與動作 */
  newGameRequest: false,
  /** 除錯 / 測試用：下一幀把玩家移到指定水平位置（高度貼齊地形） */
  teleportRequest: null as { x: number; z: number } | null,
  /** 互動、採集等一次性動作剩餘時間（秒）；大於 0 時播放動作動畫並暫停移動 */
  action: null as { clip: 'interact' | 'attack'; remaining: number } | null,
  /** 掉落重置次數（測試與除錯觀察用） */
  respawnCount: 0,
  /** 沿途記錄的安全點；Player 掛載時以出生點初始化 */
  safePoints: { points: [], groundedFor: 0 } as SafePointTrail,
};

export const cameraRuntime = {
  /** 攝影機繞角色的水平角度（0 = 攝影機在角色 +Z 側） */
  yaw: 0,
  /** 仰角（弧度，正值表示攝影機在角色上方） */
  pitch: 0.35,
  distance: 6,
  /** 本幀實際的攝影機位置（唯讀，供測試與之後的音效聆聽者使用） */
  position: { x: 0, y: 0, z: 0 },
};
