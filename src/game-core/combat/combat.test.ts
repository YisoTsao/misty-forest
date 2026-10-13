import { describe, expect, it } from 'vitest';
import enemiesData from '@/data/enemies.json';
import spawnersData from '@/data/spawners.json';
import lootData from '@/data/lootTables.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { countItem } from '../inventory/inventory';
import { objectiveProgress } from '../quest/quest';
import { testContext } from '../testing/fixtures';
import { mulberry32 } from '../util/random';
import { isInAttackArea, parseCombatData, PLAYER_STATS } from './combat';
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
    expect(data.spawners.every((s) => s.budget.clear === 0)).toBe(true);
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
    const r1 = run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'attack' });
    expect(r1.events).toEqual([{ type: 'EnemyDamaged', enemyId: id, amount: PLAYER_STATS.attack.damage, hp: wisp.maxHp - PLAYER_STATS.attack.damage, attack: 'attack' }]);
    s = r1.state;
    const r2 = run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'skill' });
    expect(r2.events.map((e) => e.type)).toEqual(['EnemyDamaged', 'EnemyDefeated', 'SpawnerCooldown', 'ItemsGained']);
    s = r2.state;
    expect(s.enemies.has(id!)).toBe(false);
    expect(countItem(s.inventory, 'flower')).toBe(1);
    expect(s.spawners.sp?.nextSpawnAt).toBe(s.time + 10);
    expect(run(s, { type: 'AttackEnemy', enemyId: id!, attack: 'attack' }).events[0]).toMatchObject({ reason: 'unknown-enemy' });
  });

  it('擊敗目標的任務進度只在接取後累計，並在里程碑改變迷霧', () => {
    let s = withEnemies(2);
    s = run(s, { type: 'AcceptQuest', quest: 'hunt' }).state;
    const ids = [...s.enemies.keys()];
    for (const id of ids) {
      s = run(s, { type: 'AttackEnemy', enemyId: id, attack: 'skill' }).state;
      s = run(s, { type: 'AttackEnemy', enemyId: id, attack: 'skill' }).state;
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

describe('命中範圍', () => {
  const player = { x: 0, z: 0, facingYaw: 0 }; // 面向 +Z
  it('攻擊：前方扇形', () => {
    expect(isInAttackArea('attack', player, { x: 0, z: 2, radius: 0.3 })).toBe(true);
    expect(isInAttackArea('attack', player, { x: 0, z: -1.5, radius: 0.3 })).toBe(false); // 背後
    expect(isInAttackArea('attack', player, { x: 0, z: 3, radius: 0.3 })).toBe(false); // 太遠
    expect(isInAttackArea('attack', player, { x: 1.2, z: 1.2, radius: 0.3 })).toBe(true); // 45°
  });
  it('技能：周圍圓形（背後也打得到）', () => {
    expect(isInAttackArea('skill', player, { x: 0, z: -3, radius: 0.3 })).toBe(true);
    expect(isInAttackArea('skill', player, { x: 5, z: 0, radius: 0.3 })).toBe(false);
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

  it('依距離降頻、太遠暫停', () => {
    expect(aiUpdateInterval(10)).toBe(0);
    expect(aiUpdateInterval(40)).toBe(0.25);
    expect(aiUpdateInterval(80)).toBeNull();
  });
});
