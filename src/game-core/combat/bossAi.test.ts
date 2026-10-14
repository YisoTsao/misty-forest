// 任務 8D：頭目 AI（苔咚）——開場、追擊、三種招式的預兆與命中範圍、縮入菌傘、震地後的破綻、第二階段、不離開戰場。
import { describe, expect, it } from 'vitest';
import enemiesJson from '@/data/enemies.json';
import { BOSS_BODY_RADIUS, bossStance, bossStrikeHits, clampToArena, createBossAi, onBossHit, stepBossAi, type BossAi, type BossInput } from './bossAi';
import { enemyDefSchema, type BossDef } from './combat';
import { createEnemyAi, type EnemyAi } from './enemyAi';

const def = enemyDefSchema.parse((enemiesJson as unknown[]).find((e) => (e as { id: string }).id === 'boss_moss_thump'));
const boss: BossDef = def.boss!;
const [cx, cz] = boss.arena.center;

function setup(): { ai: EnemyAi; b: BossAi } {
  return { ai: createEnemyAi(boss.home[0], boss.home[1]), b: createBossAi() };
}

function input(player: { x: number; z: number }, o: Partial<BossInput> = {}): BossInput {
  return { dt: 1 / 30, player: { ...player, alive: true }, hpRatio: 1, random: () => 0.1, ...o };
}

/** 推進到狀態離開 from（或超過 limit 秒），回傳期間的出手 */
function runUntilLeaves(ai: EnemyAi, b: BossAi, from: BossAi['state'], player: { x: number; z: number }, o: Partial<BossInput> = {}, limit = 10) {
  const strikes = [];
  for (let t = 0; t < limit && b.state === from; t += 1 / 30) {
    const out = stepBossAi(ai, b, boss, input(player, o));
    if (out.strike) strikes.push(out.strike);
  }
  return strikes;
}

describe('苔咚的 AI', () => {
  it('開場時不出招，開場結束後才開始追擊', () => {
    const { ai, b } = setup();
    const player = { x: boss.home[0] - 3, z: boss.home[1] };
    const strikes = runUntilLeaves(ai, b, 'intro', player);
    expect(strikes).toEqual([]);
    expect(b.state).toBe('chase');
    expect(b.timer).toBeLessThan(0.1);
  });

  it('根刺：第一個標記在玩家腳下，前搖結束才判定；站在標記外不會被打到', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 0;
    const player = { x: boss.home[0] - 4, z: boss.home[1] };
    stepBossAi(ai, b, boss, input(player, { force: 'spikes' }));
    expect(b.state).toBe('spikes');
    expect(b.markers).toHaveLength(boss.moves.spikes!.count);
    expect(Math.hypot(b.markers[0]!.x - player.x, b.markers[0]!.z - player.z)).toBeLessThan(0.01);
    const strikes = runUntilLeaves(ai, b, 'spikes', player);
    expect(strikes).toHaveLength(1);
    const strike = strikes[0]!;
    expect(bossStrikeHits(strike, player)).toBe(true);
    // 往旁邊跑出標記（另外幾根在 spread 距離上，跑到兩根之間的空隙）
    if (strike.move !== 'spikes') throw new Error('應該是根刺');
    const other = strike.points[1]!;
    const gap = Math.atan2(other.z - player.z, other.x - player.x) + Math.PI / 2;
    expect(bossStrikeHits(strike, { x: player.x + Math.cos(gap) * 2.5, z: player.z + Math.sin(gap) * 2.5 })).toBe(false);
    expect(b.cooldown).toBeCloseTo(boss.moves.spikes!.cooldown, 5);
  });

  it('第二階段：血量低於一半時根刺變多、冷卻變短，且不會回到第一階段', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 0;
    const player = { x: boss.home[0] - 4, z: boss.home[1] };
    const out = stepBossAi(ai, b, boss, input(player, { hpRatio: 0.4, force: 'spikes' }));
    expect(out.phaseChanged).toBe(true);
    expect(b.phase).toBe(2);
    expect(b.markers).toHaveLength(boss.moves.spikes!.count2);
    runUntilLeaves(ai, b, 'spikes', player, { hpRatio: 0.9 });
    expect(b.cooldown).toBeCloseTo(boss.moves.spikes!.cooldown * boss.phase2Cooldown, 5);
    expect(b.phase).toBe(2);
  });

  it('跳躍震地：落點在起跳時決定，落地時半徑內受傷，之後卡在地上（破綻）', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 0;
    const player = { x: boss.home[0] + 1, z: boss.home[1] + 12 };
    stepBossAi(ai, b, boss, input(player, { force: 'slam' }));
    expect(b.state).toBe('slam');
    const target = { ...b.slamTo };
    runUntilLeaves(ai, b, 'slam', player);
    expect(b.state).toBe('air');
    // 起跳後玩家跑開：落點不變
    const strikes = runUntilLeaves(ai, b, 'air', { x: player.x + 8, z: player.z });
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ move: 'slam', x: target.x, z: target.z });
    expect(ai.x).toBeCloseTo(target.x, 5);
    expect(bossStrikeHits(strikes[0]!, player)).toBe(true);
    expect(bossStrikeHits(strikes[0]!, { x: player.x + boss.moves.slam!.radius + 1, z: player.z })).toBe(false);
    expect(b.state).toBe('recover');
    expect(bossStance(b)).toBe('recover');
    runUntilLeaves(ai, b, 'recover', player);
    expect(b.state).toBe('chase');
  });

  it('睡眠孢子：前搖後段方向固定，扇形外與背後不會被吹到', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 0;
    const player = { x: ai.x, z: ai.z + 5 };
    stepBossAi(ai, b, boss, input(player, { force: 'spores' }));
    expect(b.state).toBe('spores');
    const strikes = runUntilLeaves(ai, b, 'spores', player);
    expect(strikes).toHaveLength(1);
    const s = strikes[0]!;
    expect(s.move).toBe('spores');
    expect(bossStrikeHits(s, player)).toBe(true);
    expect(bossStrikeHits(s, { x: ai.x, z: ai.z - 5 })).toBe(false);
    expect(bossStrikeHits(s, { x: ai.x + 5, z: ai.z })).toBe(false);
    expect(bossStrikeHits(s, { x: ai.x, z: ai.z + boss.moves.spores!.range + 1 })).toBe(false);
  });

  it('連續被打會縮入菌傘（減傷姿態），時間到就出來反擊', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 5;
    for (let i = 0; i < boss.guard!.afterHits; i++) onBossHit(b);
    const player = { x: ai.x - 3, z: ai.z };
    stepBossAi(ai, b, boss, input(player));
    expect(b.state).toBe('guard');
    expect(bossStance(b)).toBe('guard');
    runUntilLeaves(ai, b, 'guard', player);
    expect(b.state).toBe('chase');
    expect(b.cooldown).toBe(0);
    expect(b.hits).toBe(0);
  });

  it('跳躍的落點與追擊都不會離開戰場，也不會走進菌樹的樹幹', () => {
    const outside = clampToArena(boss, { x: cx + 100, z: cz });
    expect(Math.hypot(outside.x - cx, outside.z - cz)).toBeCloseTo(boss.arena.radius - BOSS_BODY_RADIUS, 5);
    const trunk = clampToArena(boss, { x: cx + 0.5, z: cz });
    expect(Math.hypot(trunk.x - cx, trunk.z - cz)).toBeGreaterThanOrEqual(boss.avoid!.radius + BOSS_BODY_RADIUS - 1e-6);
    // 玩家在樹幹另一側：繞過去而不是穿過去
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 99;
    const player = { x: cx + 8, z: cz };
    for (let i = 0; i < 30 * 12; i++) {
      stepBossAi(ai, b, boss, input(player));
      expect(Math.hypot(ai.x - cx, ai.z - cz)).toBeGreaterThanOrEqual(boss.avoid!.radius + BOSS_BODY_RADIUS - 0.05);
    }
    expect(Math.hypot(ai.x - player.x, ai.z - player.z)).toBeLessThan(4);
  });

  it('玩家倒下（或和平模式）時頭目不出招', () => {
    const { ai, b } = setup();
    b.state = 'chase';
    b.cooldown = 0;
    for (let i = 0; i < 90; i++) stepBossAi(ai, b, boss, { ...input({ x: ai.x - 3, z: ai.z }), player: { x: ai.x - 3, z: ai.z, alive: false } });
    expect(b.state).toBe('chase');
  });
});
