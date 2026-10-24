// 第二章 M-03 霧紋森林狼（規格 §6.2）：發現玩家時嚎叫，附近還在待機 / 巡邏的同伴一起追擊；被叫來的不會再嚎叫，也不會生成新的敵人。
import { describe, expect, it } from 'vitest';
import { alertEnemy, createEnemyAi, packToAlert, stepEnemyAi } from '@/game-core/combat/enemyAi';
import { worldDataResult } from '../worldData';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const wolf = worldDataResult.data.combat.enemies.get('mob_mist_wolf')!;
const radius = wolf.pack!.radius;

describe('霧紋森林狼', () => {
  it('自己發現玩家時 noticed；被同伴叫醒的不會再嚎叫', () => {
    const ai = createEnemyAi(0, 0);
    const out = stepEnemyAi(ai, wolf, { dt: 0.05, player: { x: 0, z: 3, alive: true }, home: { x: 0, z: 0, radius: 4 }, random: () => 0.5 });
    expect(out.noticed).toBe(true);
    expect(ai.state).toBe('chase');
    const buddy = createEnemyAi(5, 0);
    alertEnemy(buddy);
    expect(buddy.state).toBe('chase');
    // 已經在追擊：下一幀不會再 noticed
    expect(stepEnemyAi(buddy, wolf, { dt: 0.05, player: { x: 0, z: 3, alive: true }, home: { x: 5, z: 0, radius: 4 }, random: () => 0.5 }).noticed).toBe(false);
  });

  it('只叫醒範圍內、同種、還在待機或巡邏的（不含自己）', () => {
    const near = { id: 'a', kind: 'mob_mist_wolf', ai: createEnemyAi(radius - 1, 0) };
    const far = { id: 'b', kind: 'mob_mist_wolf', ai: createEnemyAi(radius + 1, 0) };
    const busy = { id: 'c', kind: 'mob_mist_wolf', ai: { ...createEnemyAi(1, 0), state: 'chase' as const } };
    const other = { id: 'd', kind: 'mob_fog_wisp', ai: createEnemyAi(1, 0) };
    const self = { id: 'w', kind: 'mob_mist_wolf', ai: createEnemyAi(0, 0) };
    expect(packToAlert({ id: 'w', kind: 'mob_mist_wolf', x: 0, z: 0 }, radius, [near, far, busy, other, self])).toEqual(['a']);
  });
});
