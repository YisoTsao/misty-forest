// 本機暫態：NPC 的位置、面向與動作（規格 5.2：NPC 不持久化）。NpcActor 每幀寫入，互動系統讀取。
import type { PatrolState } from '@/game-core/npc/npc';
import { terrainHeight } from '@/game-core/world/terrain';
import { npcs } from '../authority';

export type NpcRuntime = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  walking: boolean;
  /** 正在和玩家對話：停下並面向玩家 */
  talking: boolean;
  patrol: PatrolState;
};

export const npcRuntime = new Map<string, NpcRuntime>(
  npcs.map((n) => [
    n.id,
    {
      x: n.position[0],
      y: terrainHeight(n.position[0], n.position[1]),
      z: n.position[1],
      yaw: n.facingYaw,
      walking: false,
      talking: false,
      patrol: { target: 1, wait: n.patrol?.pauseSec ?? 0 },
    },
  ]),
);
