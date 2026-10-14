// 迷霧芽怪吐出的泥團（任務 8B，Bible §6.6）：本機模擬飛行，碰到玩家時交給權威層結算（傷害與緩速）。
// 畫面上沿用法術彈體的光點與拖尾（projectileVisuals）。
import type { EnemyDef } from '@/game-core/combat/combat';
import { terrainHeight } from '@/game-core/world/terrain';
import { authority } from '../authority';
import { playerRuntime } from '../player/localRuntime';
import { projectileVisuals, vfx, type Rgb } from '../vfx/vfxQueue';
import { combatRuntime } from './combatRuntime';

export type Spit = {
  id: number;
  enemyId: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
};

/** 泥團的顏色（迷霧染成灰紫色的泥）；湖區怪物（任務 9B）：水泡精的水泡、霧鷺影的霧羽 */
const SPIT_COLOR: Rgb = [0.62, 0.5, 0.82];
const SPIT_COLORS: Partial<Record<NonNullable<EnemyDef['procedural']>, Rgb>> = {
  bubble_wisp: [0.55, 0.85, 0.95],
  bubble_wisp_small: [0.55, 0.85, 0.95],
  mist_heron: [0.72, 0.78, 0.86],
};
/** 離玩家身體中心這麼近算打中 */
const HIT_RADIUS = 0.75;
const GRAVITY = 9;
const MAX_AGE = 3;
/** 玩家身體中心離腳底的高度 */
const BODY_Y = 0.8;

export const enemySpits: Spit[] = [];
let nextId = 1_000_000;

/** 從敵人嘴邊朝目標點拋出泥團（拋物線，飛到目標點附近時剛好落到身體高度） */
export function spawnSpit(enemyId: string, def: EnemyDef, from: { x: number; z: number }, target: { x: number; z: number }): void {
  if (def.behavior?.kind !== 'spit') return;
  const speed = def.behavior.speed;
  const y0 = terrainHeight(from.x, from.z) + 0.8;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const t = dist / speed;
  const yTarget = terrainHeight(target.x, target.z) + BODY_Y;
  const vy = (yTarget - y0 + 0.5 * GRAVITY * t * t) / t;
  const spit: Spit = { id: nextId++, enemyId, x: from.x, y: y0, z: from.z, vx: (dx / dist) * speed, vy, vz: (dz / dist) * speed, age: 0 };
  enemySpits.push(spit);
  projectileVisuals.set(spit.id, { id: spit.id, x: spit.x, y: spit.y, z: spit.z, color: (def.procedural && SPIT_COLORS[def.procedural]) ?? SPIT_COLOR, size: 0.32, trail: 0.5 });
}

function remove(i: number): void {
  const s = enemySpits[i]!;
  projectileVisuals.delete(s.id);
  enemySpits.splice(i, 1);
}

/** 每幀推進；命中玩家時送出 EnemyStrike（spit） */
export function stepSpits(dt: number): void {
  const p = playerRuntime.position;
  const feet = p.y - BODY_Y;
  for (let i = enemySpits.length - 1; i >= 0; i--) {
    const s = enemySpits[i]!;
    s.age += dt;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    const vis = projectileVisuals.get(s.id);
    if (vis) Object.assign(vis, { x: s.x, y: s.y, z: s.z });
    const hit = Math.hypot(s.x - p.x, s.z - p.z) < HIT_RADIUS && s.y > feet - 0.2 && s.y < feet + 1.9;
    if (hit) {
      if (combatRuntime.invulnerable <= 0 && !authority.getState().player.defeated && authority.getState().enemies.has(s.enemyId)) {
        authority.send({ type: 'EnemyStrike', enemyId: s.enemyId, spit: true });
      }
      vfx({ type: 'burst', preset: 'boltHit', x: s.x, y: s.y, z: s.z, color: SPIT_COLOR, scale: 1.2 });
      remove(i);
      continue;
    }
    if (s.y < terrainHeight(s.x, s.z) || s.age > MAX_AGE) {
      vfx({ type: 'burst', preset: 'boltHit', x: s.x, y: terrainHeight(s.x, s.z) + 0.1, z: s.z, color: SPIT_COLOR, scale: 0.8 });
      remove(i);
    }
  }
}

/** 新遊戲 / 讀檔：清掉飛行中的泥團 */
export function clearSpits(): void {
  for (const s of enemySpits) projectileVisuals.delete(s.id);
  enemySpits.length = 0;
}
