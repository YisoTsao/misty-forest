// 任務 7E：霧團噗啾王（Bible §5.5）——以實際資料驗證 AI（衝撞、彈出霧球、膨脹震地、燈塔的光讓牠暈眩）、
// 權威規則（燈塔點亮後才開戰、沒有迷霧護盾、招式傷害、暈眩時的破綻、掉落），以及戰場與戰後的小噗啾。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { bossStance, bossStrikeHits, createBossAi, stepBossAi, stunBoss, type BossAi, type BossInput } from '@/game-core/combat/bossAi';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { createEnemyAi, type EnemyAi } from '@/game-core/combat/enemyAi';
import { countItem } from '@/game-core/inventory/inventory';
import { mapIdAt } from '@/game-core/world/maps';
import { terrainHeight } from '@/game-core/world/terrain';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const index = new WorldIndex(data);
const ctx: RulesContext = {
  world: index,
  items: data.items,
  lootTables: data.lootTables,
  random: () => 0.5,
  quests: data.quests,
  combat: data.combat,
  weapons: data.weapons,
  spells: data.spells,
  buildables: data.buildables,
  allowDebugCommands: true,
};
const BOSS = 'boss_dawn_mist_puff';
const def = data.combat.enemies.get(BOSS)!;
const boss = def.boss!;
const [CX, CZ] = boss.arena.center;

function run(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
}
function ok(state: GameState, cmd: GameCommand) {
  const r = run(state, cmd);
  const rejected = r.events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return r;
}
function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}

/** 燈塔點亮（燈塔任務完成） */
function lit(): GameState {
  return { ...initialGameState(), quests: { quest_dawn_003: { status: 'completed' } } };
}

function fighting(): { state: GameState; enemyId: string } {
  const r = ok(lit(), { type: 'StartBossFight', boss: BOSS });
  const spawned = r.events.find((e) => e.type === 'EnemySpawned');
  if (spawned?.type !== 'EnemySpawned') throw new Error('沒有生成頭目');
  return { state: r.state, enemyId: spawned.enemyId };
}

/** AI：開場結束後站在 home，玩家在 (px, pz) */
function setup(px: number, pz: number): { ai: EnemyAi; b: BossAi; input: (dt: number, extra?: Partial<BossInput>) => BossInput } {
  const ai = createEnemyAi(boss.home[0], boss.home[1], 0);
  const b = createBossAi();
  const input = (dt: number, extra: Partial<BossInput> = {}): BossInput => ({ dt, player: { x: px, z: pz, alive: true }, hpRatio: 1, random: () => 0.3, ...extra });
  stepBossAi(ai, b, boss, input(boss.introSec + 0.01));
  return { ai, b, input };
}

describe('資料', () => {
  it('戰場在晨曦谷地燈塔東邊的平地上，戰場內沒有碰撞物；星光鏡在戰場邊；重試點在戰場外', () => {
    expect(mapIdAt(CX, CZ)).toBe('dawnvale');
    const heights = Array.from({ length: 24 }, (_, i) => terrainHeight(CX + Math.cos(i) * boss.arena.radius * 0.9, CZ + Math.sin(i) * boss.arena.radius * 0.9));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
    expect(index.colliders.query(CX, CZ, boss.arena.radius - 1, []).filter((c) => !c.id.startsWith('npc'))).toEqual([]);
    const mirror = index.placement(boss.stun!.mirrors[0]!)!;
    const d = Math.hypot(mirror.position[0] - CX, mirror.position[2] - CZ);
    expect(d).toBeGreaterThan(boss.arena.radius - 2);
    expect(d).toBeLessThan(boss.arena.radius + 4);
    expect(Math.hypot(boss.retryAt[0] - CX, boss.retryAt[1] - CZ)).toBeGreaterThan(boss.arena.radius + 2);
    // Bible §5.5：蓄力約 0.8 秒
    for (const m of Object.values(boss.moves)) expect(m?.windup).toBe(0.8);
    expect(boss.troughs).toEqual([]);
    expect(boss.guard).toBeUndefined();
  });
});

describe('霧團噗啾王的 AI', () => {
  it('衝撞：蓄力時轉向玩家，衝出去碰到玩家只算一次，衝完回到追擊', () => {
    const { ai, b, input } = setup(CX, CZ + 8);
    stepBossAi(ai, b, boss, input(0.01, { force: 'charge' }));
    expect(b.state).toBe('charge');
    const strikes = [];
    for (let i = 0; i < 200 && b.state !== 'chase'; i++) {
      const out = stepBossAi(ai, b, boss, input(1 / 60));
      if (out.strike) strikes.push(out.strike);
    }
    expect(strikes).toHaveLength(1);
    expect(strikes[0]!.move).toBe('charge');
    expect(bossStrikeHits(strikes[0]!, { x: CX, z: CZ + 8 })).toBe(true);
  });

  it('衝撞：玩家在蓄力後段閃開就撞不到', () => {
    const { ai, b, input } = setup(CX, CZ + 8);
    stepBossAi(ai, b, boss, input(0.01, { force: 'charge' }));
    for (let i = 0; i < 200 && b.state === 'charge'; i++) stepBossAi(ai, b, boss, input(1 / 60, { player: { x: CX + (b.timer > 0.6 ? 5 : 0), z: CZ + 8, alive: true } }));
    let hit = false;
    for (let i = 0; i < 200 && b.state === 'dash'; i++) if (stepBossAi(ai, b, boss, input(1 / 60, { player: { x: CX + 5, z: CZ + 8, alive: true } })).strike) hit = true;
    expect(hit).toBe(false);
  });

  it('彈出霧球：一顆落在玩家腳下、其餘在身邊一圈；第二階段更多顆', () => {
    const { ai, b, input } = setup(CX + 3, CZ + 3);
    stepBossAi(ai, b, boss, input(0.01, { force: 'orbs' }));
    expect(b.markers).toHaveLength(boss.moves.orbs!.count);
    expect(b.markers[0]).toEqual({ x: CX + 3, z: CZ + 3 });
    for (const m of b.markers.slice(1)) expect(Math.hypot(m.x - ai.x, m.z - ai.z)).toBeCloseTo(boss.moves.orbs!.ring, 0);
    let out = stepBossAi(ai, b, boss, input(boss.moves.orbs!.windup));
    expect(out.strike?.move).toBe('orbs');
    // 第二階段
    const second = setup(CX + 3, CZ + 3);
    out = stepBossAi(second.ai, second.b, boss, second.input(0.01, { hpRatio: 0.3, force: 'orbs' }));
    expect(out.phaseChanged).toBe(true);
    expect(second.b.markers).toHaveLength(boss.moves.orbs!.count2);
  });

  it('燈塔的光：只有蓄力時能讓牠暈眩；暈眩是破綻，時間到回到追擊', () => {
    const { ai, b, input } = setup(CX, CZ + 6);
    expect(stunBoss(b, boss)).toBe(false);
    stepBossAi(ai, b, boss, input(0.01, { force: 'slam' }));
    expect(b.state).toBe('slam');
    expect(stunBoss(b, boss)).toBe(true);
    expect(b.state).toBe('stunned');
    expect(bossStance(b)).toBe('recover');
    stepBossAi(ai, b, boss, input(boss.stun!.sec - 0.1));
    expect(b.state).toBe('stunned');
    stepBossAi(ai, b, boss, input(0.2));
    expect(b.state).toBe('chase');
  });

  it('沒有縮殼防禦：一直打也不會進入 guard', () => {
    const { ai, b, input } = setup(CX, CZ + 2);
    b.hits = 99;
    stepBossAi(ai, b, boss, input(0.01));
    expect(b.state).not.toBe('guard');
  });
});

describe('霧團噗啾王的權威規則', () => {
  it('燈塔點亮後才開戰', () => {
    expect(rejection(initialGameState(), { type: 'StartBossFight', boss: BOSS })).toBe('quest-unavailable');
    expect(rejection(lit(), { type: 'StartBossFight', boss: BOSS })).toBeNull();
  });

  it('沒有迷霧護盾：傷害不打折、打得倒；暈眩時加傷', () => {
    const { state, enemyId } = fighting();
    const normal = ok(state, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' }).events.find((e) => e.type === 'EnemyDamaged');
    const stunned = ok(state, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst', stance: 'recover' }).events.find((e) => e.type === 'EnemyDamaged');
    const base = data.spells.get('spell_starlight_burst')!.damage;
    expect(normal).toMatchObject({ amount: base });
    expect(stunned).toMatchObject({ amount: Math.round(base * boss.recoverScale) });
  });

  it('招式傷害依資料；擊敗後掉落星光碎屑與霧凝膠、記錄已擊敗', () => {
    const { state, enemyId } = fighting();
    for (const move of ['charge', 'orbs', 'slam'] as const) {
      const r = ok(state, { type: 'EnemyStrike', enemyId, move });
      expect(r.state.player.hp).toBe(100 - boss.moves[move]!.damage);
    }
    let s = state;
    for (let i = 0; i < 100 && s.enemies.has(enemyId); i++) s = ok({ ...s, player: { ...s.player, mp: 100 } }, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' }).state;
    expect(s.defeatedBosses).toEqual([BOSS]);
    expect(countItem(s.inventory, 'starlight_shard')).toBeGreaterThanOrEqual(2);
    expect(countItem(s.inventory, 'mist_gel')).toBeGreaterThanOrEqual(1);
  });

  it('戰後：小噗啾出現在村外，米菈說牠只是生病了', () => {
    const condCtx = { quests: data.quests };
    const puff = data.npcs.find((n) => n.id === 'puff')!;
    const elder = data.npcs.find((n) => n.id === 'elder')!;
    const before = lit();
    expect(evaluateCondition(puff.visible, before, condCtx)).toBe(false);
    const after = { ...before, defeatedBosses: [BOSS] };
    expect(evaluateCondition(puff.visible, after, condCtx)).toBe(true);
    expect(mapIdAt(...puff.position)).toBe('dawnvale');
    expect(Math.hypot(puff.position[0] - CX, puff.position[1] - CZ)).toBeGreaterThan(40);
    expect(pickDialogue(elder.talk, after, condCtx)).toBe('elder_puff_after');
  });
});
