// 任務 8D：頭目戰的權威規則（戰場物件、護盾、縮殼、重試、存讀檔）。苔咚已從遊戲移除（任務 12A），
// 以實際遊戲資料加上測試樣本 testing/legacyForest 驗證——開戰條件（8D-2：守衛任務進行中）、水槽只在戰鬥中能注水、迷霧護盾、
// 水槽沒注滿前打不倒、招式傷害與睡眠孢子、倒下後重試（頭目回去、水槽保留）、擊敗後的掉落與紀錄、存讀檔。
import { describe, expect, it } from 'vitest';
import { applyEvents, filledTroughs, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { bossShieldScale } from '@/game-core/combat/combat';
import { countItem } from '@/game-core/inventory/inventory';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { LEGACY_BOSS, withLegacyForest } from '@/game-core/testing/legacyForest';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = withLegacyForest(worldDataResult.data);
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
const BOSS = LEGACY_BOSS;
const def = data.combat.enemies.get(BOSS)!;
const boss = def.boss!;

function run(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
}

function ok(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const r = run(state, cmd);
  const rejected = r.events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return r;
}

function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}

/** 奇奇的水道任務完成（苔冠空地入口打開），接了「苔冠下的守衛」（任務 8D-2：開戰條件） */
function ready(): GameState {
  return { ...initialGameState(), quests: { quest_forest_002: { status: 'completed' }, quest_forest_003: { status: 'active' } } };
}

function fighting(): { state: GameState; enemyId: string } {
  const r = ok(ready(), { type: 'StartBossFight', boss: BOSS });
  const spawned = r.events.find((e) => e.type === 'EnemySpawned');
  if (spawned?.type !== 'EnemySpawned') throw new Error('沒有生成頭目');
  return { state: r.state, enemyId: spawned.enemyId };
}

function fillTroughs(state: GameState, n: number): GameState {
  for (const id of boss.troughs.slice(0, n)) state = ok(state, { type: 'ActivateObject', placementId: id }).state;
  return state;
}

/** 用劍的重擊打到頭目倒下或打不動為止 */
function beat(state: GameState, enemyId: string, attack = 'spell_starlight_burst', max = 200): GameState {
  for (let i = 0; i < max && state.enemies.has(enemyId); i++) {
    state = ok({ ...state, player: { ...state.player, mp: 100 } }, { type: 'AttackEnemy', enemyId, attack }).state;
    if (state.enemies.get(enemyId)?.hp === 1 && filledTroughs(state, boss) < boss.troughs.length) break;
  }
  return state;
}

describe('苔咚頭目戰', () => {
  it('沒接「苔冠下的守衛」前不能開戰；接了以後開戰，重複開戰被拒絕；一般生成不會補出頭目', () => {
    expect(rejection(initialGameState(), { type: 'StartBossFight', boss: BOSS })).toBe('quest-unavailable');
    // 只完成水道任務、還沒接守衛任務：不開戰
    const waterOnly = { ...initialGameState(), quests: { quest_forest_002: { status: 'completed' as const } } };
    expect(rejection(waterOnly, { type: 'StartBossFight', boss: BOSS })).toBe('quest-unavailable');
    const { state, enemyId } = fighting();
    expect(state.enemies.get(enemyId)).toMatchObject({ kind: BOSS, hp: def.maxHp });
    expect(rejection(state, { type: 'StartBossFight', boss: BOSS })).toBe('already-active');
    // 時間前進：manual 生成點不補充、也不收回
    const after = ok(ready(), { type: 'AdvanceTime', dt: 60 }).state;
    expect([...after.enemies.values()].some((e) => e.kind === BOSS)).toBe(false);
    const still = ok(state, { type: 'AdvanceTime', dt: 60 }).state;
    expect(still.enemies.has(enemyId)).toBe(true);
  });

  it('水槽只在戰鬥中能注水，注過的不能再注', () => {
    expect(rejection(ready(), { type: 'ActivateObject', placementId: boss.troughs[0]! })).toBe('not-in-fight');
    const { state } = fighting();
    const filled = fillTroughs(state, 1);
    expect(filledTroughs(filled, boss)).toBe(1);
    expect(rejection(filled, { type: 'ActivateObject', placementId: boss.troughs[0]! })).toBe('already-active');
  });

  it('迷霧護盾：傷害依注水的水槽數變大；水槽沒注滿前最多打到剩 1', () => {
    const { state, enemyId } = fighting();
    const hit = (s: GameState) => {
      const e = run(s, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' }).events.find((x) => x.type === 'EnemyDamaged');
      return e?.type === 'EnemyDamaged' ? e.amount : 0;
    };
    const base = data.spells.get('spell_starlight_burst')!.damage;
    for (let n = 0; n <= boss.troughs.length; n++) expect(hit(fillTroughs(state, n))).toBe(Math.round(base * bossShieldScale(boss, n)));
    const stuck = beat(fillTroughs(state, 2), enemyId);
    expect(stuck.enemies.get(enemyId)?.hp).toBe(1);
    expect(stuck.defeatedBosses).toEqual([]);
  });

  it('縮入菌傘時減傷、震地後的破綻加傷', () => {
    const { state, enemyId } = fighting();
    const full = fillTroughs(state, 3);
    const amount = (stance?: 'guard' | 'recover') => {
      const e = run(full, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst', ...(stance ? { stance } : {}) }).events.find((x) => x.type === 'EnemyDamaged');
      return e?.type === 'EnemyDamaged' ? e.amount : 0;
    };
    const base = amount();
    expect(amount('guard')).toBe(Math.round(base * boss.guard!.scale));
    expect(amount('recover')).toBe(Math.round(base * boss.recoverScale));
  });

  it('招式的傷害依資料；睡眠孢子讓玩家變慢；一般敵人不能帶招式、頭目不能不帶招式', () => {
    const { state, enemyId } = fighting();
    for (const move of ['spikes', 'slam', 'spores'] as const) {
      const r = ok(state, { type: 'EnemyStrike', enemyId, move });
      expect(r.state.player.hp).toBe(100 - boss.moves[move]!.damage);
      const slowed = r.events.find((e) => e.type === 'PlayerSlowed');
      if (move === 'spores') expect(slowed).toMatchObject({ sec: boss.moves.spores!.slowSec, scale: boss.moves.spores!.slowScale, cause: 'spores' });
      else expect(slowed).toBeUndefined();
    }
    expect(rejection(state, { type: 'EnemyStrike', enemyId })).toBe('invalid-command');
    const wisp = ok({ ...initialGameState(), mist: { ...initialGameState().mist, forest: 'dense' } }, { type: 'AdvanceTime', dt: 1 }).state;
    const other = [...wisp.enemies.values()][0]!;
    expect(rejection(wisp, { type: 'EnemyStrike', enemyId: other.id, move: 'slam' })).toBe('invalid-command');
  });

  it('倒下後重試：頭目回去（下次滿血重新開戰），已注水的水槽保留', () => {
    const { state, enemyId } = fighting();
    let s = fillTroughs(state, 2);
    s = ok(s, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' }).state;
    s = { ...s, player: { ...s.player, hp: 5 } };
    const r = ok(s, { type: 'EnemyStrike', enemyId, move: 'slam' });
    expect(r.events.map((e) => e.type)).toEqual(['PlayerDamaged', 'PlayerDefeated', 'EnemyDespawned']);
    expect(r.state.enemies.has(enemyId)).toBe(false);
    expect(filledTroughs(r.state, boss)).toBe(2);
    expect(rejection(r.state, { type: 'StartBossFight', boss: BOSS })).toBe('player-defeated');
    const up = ok(r.state, { type: 'RespawnPlayer' }).state;
    const again = ok(up, { type: 'StartBossFight', boss: BOSS });
    const spawned = again.events.find((e) => e.type === 'EnemySpawned');
    expect(spawned).toMatchObject({ hp: def.maxHp });
    expect(spawned?.type === 'EnemySpawned' && spawned.enemyId).not.toBe(enemyId);
  });

  it('離開戰場結束戰鬥；沒在戰鬥時結束被拒絕', () => {
    const { state, enemyId } = fighting();
    const r = ok(state, { type: 'EndBossFight', boss: BOSS });
    expect(r.state.enemies.has(enemyId)).toBe(false);
    expect(rejection(r.state, { type: 'EndBossFight', boss: BOSS })).toBe('not-in-fight');
  });

  it('水槽全部注滿後打得倒：固定掉落苔冠菌帽、記錄已擊敗、不能再開戰', () => {
    const { state, enemyId } = fighting();
    const won = beat(fillTroughs(state, 3), enemyId);
    expect(won.enemies.has(enemyId)).toBe(false);
    expect(won.defeatedBosses).toEqual([BOSS]);
    expect(countItem(won.inventory, 'moss_cap')).toBe(1);
    expect(rejection(won, { type: 'StartBossFight', boss: BOSS })).toBe('already-defeated');
  });

  it('存檔：已擊敗的頭目寫入並讀回；打到一半的頭目不保留（讀檔後重新開戰）', () => {
    const player = { position: { x: 2090, y: 2, z: 46 }, facingYaw: 0 };
    const { state, enemyId } = fighting();
    const mid = fromSaveData(toSaveData(fillTroughs(state, 1), player, new Date()), ctx);
    expect(mid.state.enemies.has(enemyId)).toBe(false);
    expect(filledTroughs(mid.state, boss)).toBe(1);
    const won = beat(fillTroughs(state, 3), enemyId);
    const loaded = fromSaveData(toSaveData(won, player, new Date()), ctx);
    expect(loaded.state.defeatedBosses).toEqual([BOSS]);
    expect(loaded.warnings).toEqual([]);
  });
});
