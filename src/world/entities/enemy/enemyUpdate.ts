// 敵人 AI 的每幀更新（迷霧噗啾與模型怪物共用）：遊玩中才更新、依距離降頻、出手時交給權威層判定。
import type { EnemyDef, SpawnerDef } from '@/game-core/combat/combat';
import { PLAYER_HIT_RADIUS } from '@/game-core/combat/bossAi';
import { alertEnemy, aiUpdateInterval, packToAlert, stepEnemyAi } from '@/game-core/combat/enemyAi';
import { isControllable } from '@/game-core/flow/gameFlow';
import { authority, currentModifiers } from '@/game/authority';
import { combatRuntime, enemyRuntime, enemyY, type EnemyVisual } from '@/game/combat/combatRuntime';
import { spawnSpit } from '@/game/combat/enemySpits';
import { vfx } from '@/game/vfx/vfxQueue';
import { playerRuntime } from '@/game/player/localRuntime';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';

/** 出手時玩家還在這個距離內才算命中（給攻擊距離一點寬容） */
export const STRIKE_SLACK = 0.45;
/** 狼嚎的提示多久最多出現一次 */
const HOWL_TOAST_MS = 10_000;
let howlToastAt = -Infinity;

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
    // 幻霧螢靈：帶著螢光提燈靠近就現形（持有即生效，與迷霧減傷同一個道具）
    lantern: def.veil !== undefined && currentModifiers().revealVeil,
    hpRatio: (authority.getState().enemies.get(id)?.hp ?? def.maxHp) / def.maxHp,
  });
  v.sinceUpdate = 0;
  // 出手：玩家仍在範圍內且不在無敵時間，交給權威層結算傷害
  if (out.strike && alive && combatRuntime.invulnerable <= 0 && toPlayer <= def.attackRange + STRIKE_SLACK) {
    authority.send({ type: 'EnemyStrike', enemyId: id });
  }
  // 枯根守衛第二階段（第二章 M-05）：第一次跌破門檻時提示；根刺突起時在標記上冒出根，玩家在標記內就受傷
  if (def.phase2 && !v.phase2Told && (authority.getState().enemies.get(id)?.hp ?? def.maxHp) / def.maxHp < def.phase2.below) {
    v.phase2Told = true;
    useUiStore.getState().pushToast({ textKey: 'combat.rootGuardPhase2' });
  }
  if (out.spikes) {
    for (const p of out.spikes.points) vfx({ type: 'burst', preset: 'purify', x: p.x, y: enemyY(p.x, p.z) + 0.4, z: p.z, color: [0.62, 0.86, 0.5], scale: 0.9 });
    const r = out.spikes.radius + PLAYER_HIT_RADIUS;
    if (alive && combatRuntime.invulnerable <= 0 && out.spikes.points.some((p) => Math.hypot(player.x - p.x, player.z - p.z) <= r)) authority.send({ type: 'EnemyStrike', enemyId: id, spikes: true });
  }
  // 霧紋森林狼（第二章 M-03）：發現玩家時嚎叫，附近待機的同伴一起追過來
  if (out.noticed && def.pack && alive) {
    const pack = packToAlert({ id, kind: v.kind, x: ai.x, z: ai.z }, def.pack.radius, [...enemyRuntime].filter(([, o]) => o.vanishing === null).map(([oid, o]) => ({ id: oid, kind: o.kind, ai: o.ai })));
    for (const other of pack) alertEnemy(enemyRuntime.get(other)!.ai);
    vfx({ type: 'shockwave', x: ai.x, y: enemyY(ai.x, ai.z) + 0.2, z: ai.z, radius: Math.min(def.pack.radius, 8), duration: 0.9, color: [0.7, 0.66, 0.9] });
    const now = performance.now();
    if (pack.length > 0 && now - howlToastAt > HOWL_TOAST_MS) {
      howlToastAt = now;
      useUiStore.getState().pushToast({ textKey: 'combat.wolfHowl', vars: { count: pack.length } });
    }
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
