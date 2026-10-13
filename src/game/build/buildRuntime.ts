// 本機暫態：建造模式的預覽位置、角度與目前的問題（放置檢查與權威層相同，畫面上先給玩家回饋）。
import type { PlacementProblem } from '@/game-core/build/build';

export type GhostProblem = PlacementProblem | 'player';

export const buildRuntime = {
  x: 0,
  z: 0,
  yaw: 0,
  problem: null as GhostProblem | null,
  /** 預覽是否已有位置（剛選好建造物的第一幀還沒有） */
  ready: false,
};
