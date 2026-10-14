// 敵人 AI 的每幀更新（迷霧噗啾與模型怪物共用）：遊玩中才更新、依距離降頻、出手時交給權威層判定。
import type { EnemyDef, SpawnerDef } from '@/game-core/combat/combat';
import { aiUpdateInterval, stepEnemyAi } from '@/game-core/combat/enemyAi';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority } from '@/game/authority';
import { combatRuntime, enemyY, type EnemyVisual } from '@/game/combat/combatRuntime';
import { spawnSpit } from '@/game/combat/enemySpits';
import { vfx } from '@/game/vfx/vfxQueue';
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
  // 霧孢飛蛾出手時散出迷霧粉塵（Bible §6.6）
  if (out.strike && def.procedural === 'fog_moth') {
    vfx({ type: 'burst', preset: 'boltHit', x: ai.x + Math.sin(ai.yaw) * 0.8, y: enemyY(ai.x, ai.z) + 1.3, z: ai.z + Math.cos(ai.yaw) * 0.8, color: [0.66, 0.6, 0.86], scale: 1.6 });
  }
  // 迷霧芽怪吐泥團、水泡精噴水泡、霧鷺影擲霧羽（瞬移前的位置射出）
  if (out.spit && alive) spawnSpit(id, def, out.blink ?? ai, out.spit);
  // 霧鷺影向後瞬移：原地留下一團水墨般的霧
  if (out.blink) {
    vfx({ type: 'burst', preset: 'boltHit', x: out.blink.x, y: enemyY(out.blink.x, out.blink.z) + 1.2, z: out.blink.z, color: [0.62, 0.7, 0.8], scale: 2 });
    vfx({ type: 'burst', preset: 'boltHit', x: ai.x, y: enemyY(ai.x, ai.z) + 1.2, z: ai.z, color: [0.75, 0.82, 0.9], scale: 1.2 });
  }
}
