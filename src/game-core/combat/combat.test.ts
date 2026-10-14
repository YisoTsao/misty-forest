import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import spawnersData from '@/data/spawners.json';
import lootData from '@/data/lootTables.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { countItem } from '../inventory/inventory';
import { objectiveProgress } from '../quest/quest';
import { testContext } from '../testing/fixtures';
import { mulberry32 } from '../util/random';
import { parseCombatData, PLAYER_STATS } from './combat';
import { MAX_MP, MP_REGEN_PER_SEC } from './spells';
import { aiUpdateInterval, applyHitReaction, createEnemyAi, stepEnemyAi } from './enemyAi';

const ctx = testContext();
const run = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  return { events, state: applyEvents(state, events, ctx) };
};
const tick = (state: GameState, dt = 1) => run(state, { type: 'AdvanceTime', dt });
const wisp = ctx.combat.enemies.get('wisp')!;

/** 讓生成點補滿：每次 tick 補一隻，間隔 3 秒 */
function withEnemies(n: number): GameState {
  let s = initialGameState();
  for (let i = 0; i < 20 && s.enemies.size < n; i++) s = tick(s, 3).state;
  return s;
}

describe('combat data', () => {
  it('專案的敵人與生成點資料合法', () => {
    const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
    expect(data.enemies.has('mist_wisp')).toBe(true);
    // 迷霧生物（迷霧噗啾、霧凝史萊姆、霧魂）在迷霧清除後不再出現；野生的怪物（任務 7C）不受影響
    const mistBorn = new Set(['mist_wisp', 'mob_mist_slime', 'mob_mist_ghost']);
    for (const sp of data.spawners) if (mistBorn.has(sp.enemy)) expect(sp.budget.clear, sp.id).toBe(0);
    // 濃霧時不會比晴朗時少
    for (const sp of data.spawners) expect(sp.budget.dense, sp.id).toBeGreaterThanOrEqual(sp.budget.clear);
  });

  it('任務 7C：至少 10 種不同的怪物，各有自己的生成點', () => {
    const data = parseCombatData(enemiesData, spawnersData, new Set(lootData.map((t) => t.id)));
    expect(data.enemies.size).toBeGreaterThanOrEqual(10);
    for (const id of data.enemies.keys()) expect(data.spawners.some((sp) => sp.enemy === id), id).toBe(true);
  });

  it('拒絕參照不存在的敵人', () => {
    expect(() => parseCombatData(enemiesData, [{ ...spawnersData[0], enemy: 'ghost' }], new Set(lootData.map((t) => t.id)))).toThrow(/ghost/);
  });
});

describe('生成（規格 1.4：生成率依迷霧階段）', () => {
  it('濃霧時補到上限，一次一隻、間隔 3 秒', () => {
    let s = initialGameState();
    s = tick(s).state;
    expect(s.enemies.size).toBe(1);
    s = tick(s, 1).state;
    expect(s.enemies.size).toBe(1); // 冷卻中
    s = tick(s, 3).state;
    expect(s.enemies.size).toBe(2);
    s = tick(s, 5).state;
    expect(s.enemies.size).toBe(2); // 上限 2
    expect([...s.enemies.values()].every((e) => e.hp === wisp.maxHp && e.spawner === 'sp')).toBe(true);
  });

  it('迷霧變淡時多出來的消散；晴朗時全部消散、不再生成', () => {
    let s = withEnemies(2);
    s = { ...s, mist: { ...s.mist, forest: 'light' } };
    s = tick(s).state;
    expect(s.enemies.size).toBe(1);
    s = { ...s, mist: { ...s.mist, forest: 'clear' } };
    s = tick(s, 100).state;
    expect(s.enemies.size).toBe(0);
  });
});

describe('玩家攻擊', () => {
  it('命中扣血；歸零時擊敗、掉落、生成點進入冷卻', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    // 預設裝備單手劍：第一招斜斬的傷害來自 data/weapons.json
    const slash = ctx.weapons.moves.get('sword_slash_diag')!.move;
    const r1 = run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'sword_slash_diag' });
    expect(r1.events).toEqual([{ type: 'EnemyDamaged', enemyId: id, amount: slash.damage, hp: wisp.maxHp - slash.damage, attack: 'sword_slash_diag' }]);
    s = r1.state;
    const r2 = run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'spell_starlight_burst' });
    expect(r2.events.map((e) => e.type)).toEqual(['EnemyDamaged', 'EnemyDefeated', 'SpawnerCooldown', 'ItemsGained']);
    s = r2.state;
    expect(s.enemies.has(id!)).toBe(false);
    expect(countItem(s.inventory, 'flower')).toBe(1);
    expect(s.spawners.sp?.nextSpawnAt).toBe(s.time + 10);
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'sword_chop' }).events[0]).toMatchObject({ reason: 'unknown-enemy' });
  });

  it('近戰招式必須屬於目前裝備的武器；切換武器後換成該武器的招式', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    expect(s.player.weapon).toBe('sword');
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'fist_kick' }).events[0]).toMatchObject({ reason: 'weapon-not-equipped' });
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'attack' }).events[0]).toMatchObject({ reason: 'unknown-move' });
    const equipped = run(s, { type: 'EquipWeapon', weapon: 'fist' });
    expect(equipped.events).toEqual([{ type: 'WeaponEquipped', weapon: 'fist' }]);
    s = equipped.state;
    expect(run(s, { type: 'EquipWeapon', weapon: 'fist' }).events).toEqual([]);
    const kick = ctx.weapons.moves.get('fist_kick')!.move;
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'fist_kick' }).events[0]).toMatchObject({ type: 'EnemyDamaged', amount: kick.damage });
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'sword_chop' }).events[0]).toMatchObject({ reason: 'weapon-not-equipped' });
  });

  it('倒下後重新站起來仍保留裝備', () => {
    const down = { ...initialGameState(), player: { hp: 0, lastDamagedAt: 0, defeated: true, weapon: 'knife' as const, mp: 50 } };
    expect(run(down, { type: 'RespawnPlayer' }).state.player).toMatchObject({ defeated: false, weapon: 'knife' });
  });

  it('擊敗目標的任務進度只在接取後累計，並在里程碑改變迷霧', () => {
    let s = withEnemies(2);
    s = run(s, { type: 'AcceptQuest', quest: 'hunt' }).state;
    const ids = [...s.enemies.keys()];
    for (const id of ids) {
      s = run(s, { type: 'AttackEnemy', enemyId: id, attack: 'spell_starlight_burst' }).state;
      s = run(s, { type: 'AttackEnemy', enemyId: id, attack: 'spell_starlight_burst' }).state;
    }
    const quest = ctx.quests.get('hunt')!;
    expect(objectiveProgress(s, quest)).toEqual([{ current: 2, target: 3 }]);
    expect(s.mist.forest).toBe('light'); // 第 2 隻是里程碑
  });
});

describe('敵人攻擊與玩家倒下', () => {
  it('受傷扣血；歸零倒下；倒下後不能攻擊；重新站起來滿血', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    expect(s.player.hp).toBe(PLAYER_STATS.maxHp - wisp.damage);
    s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    const r = run(s, { type: 'EnemyStrike', enemyId: id! });
    expect(r.events.map((e) => e.type)).toEqual(['PlayerDamaged', 'PlayerDefeated']);
    s = r.state;
    expect(s.player).toMatchObject({ hp: 0, defeated: true });
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'attack' }).events[0]).toMatchObject({ reason: 'player-defeated' });
    s = run(s, { type: 'RespawnPlayer' }).state;
    expect(s.player).toMatchObject({ hp: PLAYER_STATS.maxHp, defeated: false });
    expect(run(s, { type: 'RespawnPlayer' }).events[0]).toMatchObject({ reason: 'invalid-command' });
  });

  it('在酒館休息體力回滿；倒下時不能休息', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    expect(s.player.hp).toBeLessThan(PLAYER_STATS.maxHp);
    s = run(s, { type: 'Rest' }).state;
    expect(s.player.hp).toBe(PLAYER_STATS.maxHp);
    for (let i = 0; i < 4; i++) s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    expect(s.player.defeated).toBe(true);
    expect(run(s, { type: 'Rest' }).events[0]).toMatchObject({ reason: 'player-defeated' });
  });

  it('脫離戰鬥一段時間後回血', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    s = run(s, { type: 'EnemyStrike', enemyId: id! }).state;
    const hurt = s.player.hp;
    s = tick(s, 1).state;
    expect(s.player.hp).toBe(hurt); // 剛受傷
    s = tick(s, PLAYER_STATS.regenDelay).state;
    expect(s.player.hp).toBeGreaterThan(hurt);
  });
});

describe('enemy AI 狀態機', () => {
  const home = { x: 0, z: 0, radius: 5 };
  const input = (px: number, pz: number, dt = 0.1, alive = true) => ({ dt, player: { x: px, z: pz, alive }, home, random: mulberry32(1) });

  it('待機 → 巡邏；玩家靠近 → 追擊 → 攻擊（前搖後出手一次）→ 冷卻中不再出手', () => {
    const ai = createEnemyAi(0, 0);
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      stepEnemyAi(ai, wisp, input(50, 50));
      seen.add(ai.state);
    }
    expect(seen.has('patrol')).toBe(true); // 待機 2.5 秒後開始巡邏
    stepEnemyAi(ai, wisp, input(ai.x + 5, ai.z));
    expect(ai.state).toBe('chase');
    let strikes = 0;
    for (let i = 0; i < 40; i++) if (stepEnemyAi(ai, wisp, input(ai.x + 1, ai.z, 0.05)).strike) strikes++;
    expect(strikes).toBe(1); // 2 秒內：前搖 0.5 秒出手一次，冷卻 1.5 秒
  });

  it('玩家離開或超出生成點範圍 → 返回；玩家倒下 → 返回', () => {
    const ai = createEnemyAi(0, 0);
    ai.state = 'chase';
    ai.x = 18;
    stepEnemyAi(ai, wisp, input(19, 0));
    expect(ai.state).toBe('return'); // 離家 > leashRadius 15
    const ai2 = createEnemyAi(0, 0);
    ai2.state = 'chase';
    stepEnemyAi(ai2, wisp, input(2, 0, 0.1, false));
    expect(ai2.state).toBe('return');
    for (let i = 0; i < 200; i++) stepEnemyAi(ai, wisp, input(50, 50));
    expect(['idle', 'patrol']).toContain(ai.state);
  });

  it('被擊中時擊退並轉為追擊', () => {
    const ai = createEnemyAi(0, 0);
    applyHitReaction(ai, { x: -1, z: 0 }, 6);
    expect(ai.state).toBe('chase');
    stepEnemyAi(ai, wisp, input(-1, 0));
    expect(ai.x).toBeGreaterThan(0);
  });

  it('衝撞型（lunge）：出手時往面向衝出，之後減速；一般敵人出手時不移動', () => {
    const charger = { ...wisp, lunge: 9 };
    const ai = createEnemyAi(0, 0);
    stepEnemyAi(ai, charger, input(1.2, 0)); // 待機 → 追擊
    stepEnemyAi(ai, charger, input(1.2, 0)); // 追擊 → 攻擊前搖
    expect(ai.state).toBe('attack');
    stepEnemyAi(ai, charger, input(1.2, 0, charger.attackWindup + 0.01));
    expect(ai.knockback.x).toBeCloseTo(9 * Math.sin(ai.yaw));
    const x0 = ai.x;
    stepEnemyAi(ai, charger, input(1.2, 0, 0.1));
    expect(ai.x).toBeGreaterThan(x0 + 0.5);
    for (let i = 0; i < 20; i++) stepEnemyAi(ai, charger, input(ai.x + 1.2, 0, 0.05, false));
    expect(Math.hypot(ai.knockback.x, ai.knockback.z)).toBeLessThan(0.5);
    const plain = createEnemyAi(0, 0);
    stepEnemyAi(plain, wisp, input(1.2, 0));
    stepEnemyAi(plain, wisp, input(1.2, 0));
    stepEnemyAi(plain, wisp, input(1.2, 0, wisp.attackWindup + 0.01));
    expect(plain.knockback).toEqual({ x: 0, z: 0 });
  });

  it('依距離降頻、太遠暫停', () => {
    expect(aiUpdateInterval(10)).toBe(0);
    expect(aiUpdateInterval(40)).toBe(0.25);
    expect(aiUpdateInterval(80)).toBeNull();
  });
});

describe('魔法與星光值（GAME_DESIGN 5.4）', () => {
  it('施放扣除星光值；不足時拒絕；倒下時不能施放', () => {
    const start = initialGameState();
    expect(start.player.mp).toBe(MAX_MP);
    const burst = ctx.spells.get('spell_starlight_burst')!;
    const cast = run(start, { type: 'CastSpell', spell: burst.id });
    expect(cast.events).toEqual([{ type: 'SpellCast', spell: burst.id, mp: MAX_MP - burst.mpCost }]);
    const low = { ...start, player: { ...start.player, mp: burst.mpCost - 1 } };
    expect(run(low, { type: 'CastSpell', spell: burst.id }).events[0]).toMatchObject({ reason: 'not-enough-mp' });
    expect(run(start, { type: 'CastSpell', spell: 'spell_nope' }).events[0]).toMatchObject({ reason: 'unknown-spell' });
    const down = { ...start, player: { ...start.player, defeated: true } };
    expect(run(down, { type: 'CastSpell', spell: burst.id }).events[0]).toMatchObject({ reason: 'player-defeated' });
  });

  it('星光值隨時間回復到上限', () => {
    const start = initialGameState();
    const low = { ...start, player: { ...start.player, mp: 10 } };
    const after = run(low, { type: 'AdvanceTime', dt: 2 }).state;
    expect(after.player.mp).toBeCloseTo(10 + MP_REGEN_PER_SEC * 2);
    expect(run(start, { type: 'AdvanceTime', dt: 2 }).events.some((e) => e.type === 'MpChanged')).toBe(false);
  });

  it('法術傷害來自資料（星屑飛彈每發）', () => {
    let s = withEnemies(1);
    const [id] = [...s.enemies.keys()];
    const bolt = ctx.spells.get('spell_star_bolt')!;
    s = run(s, { type: 'AttackEnemy', enemyId: id!, attack: bolt.id }).state;
    expect(s.enemies.get(id!)?.hp).toBe(wisp.maxHp - bolt.damage);
  });

  it('除錯設定星光值：只在允許除錯時、夾在 0 到上限之間', () => {
    expect(run(initialGameState(), { type: 'DebugSetMp', mp: 5 }).events[0]).toMatchObject({ reason: 'not-allowed' });
    const debugCtx = { ...ctx, allowDebugCommands: true };
    const events = handleCommand(initialGameState(), { type: 'DebugSetMp', mp: 500 }, debugCtx);
    expect(events).toEqual([{ type: 'MpChanged', mp: MAX_MP }]);
  });
});
