// 任務 8B：盤旋（霧孢飛蛾）、縮殼與破綻（根鬚甲蟲）、吐泥（迷霧芽怪）的行為與權威層的傷害倍率、緩速。
// 飛蛾與甲蟲已從遊戲移除（任務 12A），改用測試樣本 testing/legacyForest；迷霧芽怪仍在晨曦谷地。
import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import spawnersData from '@/data/spawners.json';
import lootData from '@/data/lootTables.json';
import { applyEvents, handleCommand, initialGameState, type GameState } from '../authority/rules';
import { testContext } from '../testing/fixtures';
import { legacyCombat } from '../testing/legacyForest';
import { parseCombatData, stanceDamageScale, type EnemyDef } from './combat';
import { aiStance, applyHitReaction, createEnemyAi, GUARD_COOLDOWN, stepEnemyAi, type EnemyAi } from './enemyAi';

const real = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
const data = { enemies: new Map([...real.enemies, ...legacyCombat.enemies]), spawners: [...real.spawners, ...legacyCombat.spawners] };
const moth = data.enemies.get('mob_fog_moth')!;
const beetle = data.enemies.get('mob_root_beetle')!;
const sprout = data.enemies.get('mob_mist_sprout')!;
const ctx = { ...testContext(), combat: data };
const home = { x: 0, z: 0, radius: 5 };
const random = () => 0.5;

function step(ai: EnemyAi, def: EnemyDef, player: { x: number; z: number }, dt = 0.05) {
  return stepEnemyAi(ai, def, { dt, player: { ...player, alive: true }, home, random });
}

function withEnemy(kind: string, hp: number): GameState {
  const s = initialGameState();
  return { ...s, enemies: new Map([['e1', { id: 'e1', kind, spawner: 'sp', hp }]]) };
}

describe('霧孢飛蛾：先盤旋再俯衝', () => {
  it('靠近玩家後在盤旋半徑上繞圈，時間到才出手', () => {
    const b = moth.behavior!;
    if (b.kind !== 'orbit') throw new Error('behavior');
    const ai = createEnemyAi(0, 0);
    const player = { x: 4, z: 0 };
    let strikes = 0;
    let orbitTime = 0;
    let firstStrikeAt = -1;
    for (let t = 0; t < 8; t += 0.05) {
      const out = step(ai, moth, player);
      if (ai.state === 'orbit') {
        orbitTime += 0.05;
        expect(Math.abs(Math.hypot(ai.x - player.x, ai.z - player.z) - b.radius)).toBeLessThan(1.8);
      }
      if (out.strike) {
        strikes++;
        if (firstStrikeAt < 0) firstStrikeAt = t;
      }
    }
    expect(orbitTime).toBeGreaterThan(b.sec * 0.9);
    expect(firstStrikeAt).toBeGreaterThan(b.sec);
    expect(strikes).toBeGreaterThan(0);
  });

  it('出手後重新開始一輪盤旋', () => {
    const ai = createEnemyAi(0, 0);
    let sawOrbitAfterStrike = false;
    let struck = false;
    for (let t = 0; t < 12; t += 0.05) {
      const out = step(ai, moth, { x: 3, z: 0 });
      if (out.strike) struck = true;
      else if (struck && ai.state === 'orbit') sawOrbitAfterStrike = true;
    }
    expect(sawOrbitAfterStrike).toBe(true);
  });
});

describe('根鬚甲蟲：縮殼與破綻', () => {
  it('被打到時縮殼，縮殼期間推不太動，時間到就反擊；短時間內不會再縮殼', () => {
    const b = beetle.behavior!;
    if (b.kind !== 'shell') throw new Error('behavior');
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    applyHitReaction(ai, { x: -1, z: 0 }, 6, beetle);
    expect(ai.state).toBe('guard');
    expect(aiStance(ai)).toBe('guard');
    expect(Math.hypot(ai.knockback.x, ai.knockback.z)).toBeLessThan(6 * 0.25);
    for (let t = 0; t < b.guardSec + 0.1; t += 0.05) step(ai, beetle, { x: 1.5, z: 0 });
    expect(ai.state === 'chase' || ai.state === 'attack').toBe(true);
    expect(ai.guardCooldown).toBeGreaterThan(GUARD_COOLDOWN - 0.5);
    applyHitReaction(ai, { x: -1, z: 0 }, 6, beetle);
    expect(ai.state).not.toBe('guard');
  });

  it('衝撞出手後進入破綻，一段時間內停在原地', () => {
    const b = beetle.behavior!;
    if (b.kind !== 'shell') throw new Error('behavior');
    const ai = createEnemyAi(0, 0);
    let recoverFrom = -1;
    for (let t = 0; t < 4; t += 0.05) {
      const out = step(ai, beetle, { x: 1.5, z: 0 });
      if (out.strike) {
        expect(ai.state).toBe('recover');
        recoverFrom = t;
        break;
      }
    }
    expect(recoverFrom).toBeGreaterThan(0);
    // 破綻中被打不會縮殼
    applyHitReaction(ai, { x: -1, z: 0 }, 6, beetle);
    expect(ai.state).toBe('recover');
    for (let t = 0; t < b.recoverSec + 0.1; t += 0.05) step(ai, beetle, { x: 1.5, z: 0 });
    expect(ai.state).not.toBe('recover');
  });

  it('權威層依姿態調整傷害：縮殼減傷、破綻加傷；其他怪物不受影響', () => {
    expect(stanceDamageScale(beetle, 'guard')).toBeLessThan(0.5);
    expect(stanceDamageScale(beetle, 'recover')).toBeGreaterThan(1);
    expect(stanceDamageScale(moth, 'guard')).toBe(1);
    const attack = 'sword_slash_diag';
    const plain = handleCommand(withEnemy('mob_root_beetle', 80), { type: 'AttackEnemy', enemyId: 'e1', attack }, ctx);
    const guard = handleCommand(withEnemy('mob_root_beetle', 80), { type: 'AttackEnemy', enemyId: 'e1', attack, stance: 'guard' }, ctx);
    const recover = handleCommand(withEnemy('mob_root_beetle', 80), { type: 'AttackEnemy', enemyId: 'e1', attack, stance: 'recover' }, ctx);
    const amount = (events: ReturnType<typeof handleCommand>) => events.find((e) => e.type === 'EnemyDamaged')?.amount ?? NaN;
    expect(amount(guard)).toBeLessThan(amount(plain));
    expect(amount(recover)).toBeGreaterThan(amount(plain));
    const mothGuard = handleCommand(withEnemy('mob_fog_moth', 34), { type: 'AttackEnemy', enemyId: 'e1', attack, stance: 'guard' }, ctx);
    const mothPlain = handleCommand(withEnemy('mob_fog_moth', 34), { type: 'AttackEnemy', enemyId: 'e1', attack }, ctx);
    expect(amount(mothGuard)).toBe(amount(mothPlain));
  });
});

describe('迷霧芽怪：吐泥團', () => {
  it('距離適中時前搖後吐泥，瞄準玩家當下的位置；太近時改用咬', () => {
    const b = sprout.behavior!;
    if (b.kind !== 'spit') throw new Error('behavior');
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    let spit: { x: number; z: number } | null = null;
    for (let t = 0; t < 2 && !spit; t += 0.05) spit = step(ai, sprout, { x: 6, z: 0 }).spit;
    expect(spit).toEqual({ x: 6, z: 0 });
    expect(ai.spitCooldown).toBeGreaterThan(b.cooldown - 0.1);
    // 貼近時不吐泥
    const near = createEnemyAi(0, 0);
    near.state = 'chase';
    for (let t = 0; t < 2; t += 0.05) expect(step(near, sprout, { x: 1, z: 0 }).spit).toBeNull();
  });

  it('泥團命中：扣吐泥的傷害並讓玩家變慢；其他怪物不能送吐泥命中', () => {
    const b = sprout.behavior!;
    if (b.kind !== 'spit') throw new Error('behavior');
    const events = handleCommand(withEnemy('mob_mist_sprout', 45), { type: 'EnemyStrike', enemyId: 'e1', spit: true }, ctx);
    expect(events).toContainEqual({ type: 'PlayerDamaged', amount: b.damage, hp: 100 - b.damage, enemyId: 'e1' });
    expect(events).toContainEqual({ type: 'PlayerSlowed', sec: b.slowSec, scale: b.slowScale });
    expect(applyEvents(withEnemy('mob_mist_sprout', 45), events, ctx).player.hp).toBe(100 - b.damage);
    const bad = handleCommand(withEnemy('mob_fog_moth', 34), { type: 'EnemyStrike', enemyId: 'e1', spit: true }, ctx);
    expect(bad[0]?.type).toBe('CommandRejected');
  });
});
