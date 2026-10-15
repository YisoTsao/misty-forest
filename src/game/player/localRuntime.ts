// 本機暫態（規格 3-7）：玩家位置、移動狀態、攝影機角度。
// 每幀由 useFrame 讀寫的可變物件，不放進 React state，也不進存檔
// （存檔時從這裡取玩家位置的快照）。
import { initialLocomotionState, type LocomotionState } from '@/game-core/character/locomotion';
import type { SafePointTrail } from '@/game-core/world/safePoints';

export const playerRuntime = {
  position: { x: 0, y: 0, z: 0 },
  locomotion: initialLocomotionState(Math.PI) as LocomotionState,
  /** 除錯 / 截圖用：強制播放指定動畫片段並停在片段長度的某個比例（0–1）。 */
  animPreview: null as { clip: string; fraction: number } | null,
  /** 開始新遊戲：下一幀回到出生點、清除安全點與動作 */
  newGameRequest: false,
  /** 讀取存檔：下一幀移到存檔位置與面向 */
  restoreRequest: null as { position: { x: number; y: number; z: number }; facingYaw: number } | null,
  /** 除錯 / 測試用：下一幀把玩家移到指定位置；省略 feetY 時腳底貼齊地形（站在橋面等物件上時需指定） */
  teleportRequest: null as { x: number; z: number; feetY?: number } | null,
  /** 互動、採集等一次性動作剩餘時間（秒）；大於 0 時播放動作動畫並暫停移動 */
  action: null as PlayerAction | null,
  /** 掉落重置次數（測試與除錯觀察用） */
  respawnCount: 0,
  /** 位置不連續的次數（傳送、讀檔、新遊戲、落水重生；Player 每次跳位置時加一）。多人連線據此送 warp 而不是一般移動 */
  warpSeq: 0,
  /** position 是哪一幀算出來的（performance.now 毫秒）：多人連線以此作為位置的時間，不用送出時的時間 */
  positionAt: 0,
  /** 沿途記錄的安全點；Player 掛載時以出生點初始化 */
  safePoints: { points: [], groundedFor: 0 } as SafePointTrail,
};

/**
 * 一次性動作。近戰招式（GAME_DESIGN 5.3）另外指定動畫片段名稱（clipName）、播放速度，
 * 以及出手時往前衝的速度與時間（lunge 公尺 / 秒，持續 lungeTime 秒）。
 */
export type PlayerAction = {
  clip: 'interact' | 'attack' | 'skill' | 'hit' | 'death';
  remaining: number;
  clipName?: string;
  speed?: number;
  lunge?: number;
  lungeTime?: number;
  /** 已經過的時間（Player 每幀累加） */
  elapsed?: number;
};

export const cameraRuntime = {
  /** 攝影機繞角色的水平角度（0 = 攝影機在角色 +Z 側） */
  yaw: 0,
  /** 仰角（弧度，正值表示攝影機在角色上方） */
  pitch: 0.35,
  distance: 6,
  /** 本幀實際的攝影機位置（唯讀，供測試與之後的音效聆聽者使用） */
  position: { x: 0, y: 0, z: 0 },
  /** 鏡頭震動強度（公尺，FollowCamera 每幀衰減；命中時由戰鬥寫入） */
  shake: 0,
};
