// 第二章 M-05 枯根守衛（規格 §6.3）：第一階段揮擊、縮殼擋傷；血量低於門檻進入第二階段——地面根刺（有預警標記），
// 放完後停下來、胸口核心暴露（破綻加傷）。根刺的傷害由權威層結算。
import { describe, expect, it } from 'vitest';
import { handleCommand, initialGameState, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { stanceDamageScale } from '@/game-core/combat/combat';
import { aiStance, applyHitReaction, createEnemyAi, stepEnemyAi, type AiInput } from '@/game-core/combat/enemyAi';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const ctx: RulesContext = {
  world: new WorldIndex(data),
  items: data.items,
  lootTables: data.lootTables,
  random: () => 0.5,
  quests: data.quests,
  combat: data.combat,
  weapons: data.weapons,
  spells: data.spells,
  buildables: data.buildables,
};
const GUARD = 'mob_root_guard';
const guard = data.combat.enemies.get(GUARD)!;
const p2 = guard.phase2!;
const player = { x: 0, z: 5, alive: true };

function run(hpRatio: number, sec: number, ai = createEnemyAi(0, 0)) {
  const outs = [];
  const input: AiInput = { dt: 0.05, player, home: { x: 0, z: 0, radius: 4 }, random: () => 0.3, hpRatio };
  ai.state = ai.state === 'idle' ? 'chase' : ai.state;
  for (let t = 0; t < sec; t += input.dt) outs.push(stepEnemyAi(ai, guard, input));
  return { ai, outs };
}

describe('枯根守衛', () => {
  it('第一階段不放根刺', () => {
    const { outs } = run(0.9, 6);
    expect(outs.some((o) => o.spikes)).toBe(false);
  });

  it('第二階段：在玩家腳下與周圍放根刺標記，前搖結束後突起', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    stepEnemyAi(ai, guard, { dt: 0.05, player, home: { x: 0, z: 0, radius: 4 }, random: () => 0.3, hpRatio: p2.below - 0.1 });
    expect(ai.state).toBe('spikes');
    expect(ai.markers).toHaveLength(p2.spikes.count);
    expect(ai.markers[0]).toEqual({ x: player.x, z: player.z });
    const { outs } = run(p2.below - 0.1, p2.spikes.windup + 0.1, ai);
    const strike = outs.find((o) => o.spikes)?.spikes;
    expect(strike?.points).toHaveLength(p2.spikes.count);
    expect(strike?.radius).toBe(p2.spikes.radius);
  });

  it('根刺之後核心暴露 coreSec 秒（破綻：傷害加成），時間到回到追擊', () => {
    const { ai } = run(p2.below - 0.1, p2.spikes.windup + 0.1);
    expect(ai.state).toBe('recover');
    expect(aiStance(ai, guard)).toBe('recover');
    expect(stanceDamageScale(guard, 'recover')).toBeGreaterThan(1);
    // 核心暴露中被打不會縮殼
    applyHitReaction(ai, player, 4, guard);
    expect(ai.state).toBe('recover');
    run(p2.below - 0.1, p2.coreSec + 0.1, ai);
    expect(ai.state).not.toBe('recover');
  });

  it('前搖中被打不會縮殼、也不會被打斷', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    stepEnemyAi(ai, guard, { dt: 0.05, player, home: { x: 0, z: 0, radius: 4 }, random: () => 0.3, hpRatio: 0.2 });
    applyHitReaction(ai, player, 4, guard);
    expect(ai.state).toBe('spikes');
  });

  it('權威層：根刺命中扣第二階段的傷害；沒有第二階段的敵人不能送根刺', () => {
    const s: GameState = { ...initialGameState(), enemies: new Map([['g', { id: 'g', kind: GUARD, spawner: 'deep_guard', hp: 10 }], ['w', { id: 'w', kind: 'mob_mist_wolf', spawner: 'deep_wolves', hp: 10 }]]) };
    expect(handleCommand(s, { type: 'EnemyStrike', enemyId: 'g', spikes: true }, ctx)[0]).toMatchObject({ type: 'PlayerDamaged', amount: p2.spikes.damage });
    expect(handleCommand(s, { type: 'EnemyStrike', enemyId: 'w', spikes: true }, ctx)[0]).toMatchObject({ type: 'CommandRejected', reason: 'invalid-command' });
  });
});
