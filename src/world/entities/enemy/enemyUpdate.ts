// 敵人 AI 的每幀更新（迷霧噗啾與模型怪物共用）：遊玩中才更新、依距離降頻、出手時交給權威層判定。
import type { EnemyDef, SpawnerDef } from '@/game-core/combat/combat';
import { aiUpdateInterval, stepEnemyAi } from '@/game-core/combat/enemyAi';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority } from '@/game/authority';
import { combatRuntime, type EnemyVisual } from '@/game/combat/combatRuntime';
import { playerRuntime } from '@/game/player/localRuntime';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen } from '@/game/state/gameStore';

/** 出手時玩家還在這個距離內才算命中（給攻擊距離一點寬容） */
export const STRIKE_SLACK = 0.45;

/** 推進一隻敵人的 AI（直接修改 v.ai）；出手時送出 EnemyStrike */
export function updateEnemyAi(id: string, v: EnemyVisual, def: EnemyDef, spawner: SpawnerDef, dt: number): void {
  const ai = v.ai;
  const player = playerRuntime.position;
  const toPlayer = Math.hypot(player.x - ai.x, player.z - ai.z);
  const interval = aiUpdateInterval(toPlayer);
  if (!isControllable(currentScreen()) || v.vanishing !== null || interval === null) return;
  v.sinceUpdate += dt;
  if (v.sinceUpdate < interval) return;
  const peaceful = useDebugStore.getState().peaceful;
  const alive = !authority.getState().player.defeated && !peaceful;
  const out = stepEnemyAi(ai, def, {
    dt: v.sinceUpdate,
    player: { x: player.x, z: player.z, alive },
    home: { x: spawner.center[0], z: spawner.center[1], radius: spawner.radius },
    random: Math.random,
  });
  v.sinceUpdate = 0;
  // 出手：玩家仍在範圍內且不在無敵時間，交給權威層結算傷害
  if (out.strike && alive && combatRuntime.invulnerable <= 0 && toPlayer <= def.attackRange + STRIKE_SLACK) {
    authority.send({ type: 'EnemyStrike', enemyId: id });
  }
}
