// 本機暫態：NPC 的位置、面向與動作（規格 5.2：NPC 不持久化）。NpcActor 每幀寫入，互動系統讀取。
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import type { NpcDef, PatrolState } from '@/game-core/npc/npc';
import { terrainHeight } from '@/game-core/world/terrain';
import { authority, npcs, quests } from '../authority';

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
      y: n.floorY ?? terrainHeight(n.position[0], n.position[1]),
      z: n.position[1],
      yaw: n.facingYaw,
      walking: false,
      talking: false,
      patrol: { target: 1, wait: n.patrol?.pauseSec ?? 0 },
    },
  ]),
);

/** NPC 目前是否在場（任務 8D-2：有出現條件的 NPC，例如戰後的苔咚） */
export function npcVisible(def: NpcDef, state = authority.getState()): boolean {
  return evaluateCondition(def.visible, state, { quests });
}
