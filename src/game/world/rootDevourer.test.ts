// 第二章 B-01 根噬者（規格 §6.4）：第二階段（迷霧暴走）召喚幻霧螢靈；血量歸零進入淨化、三座共鳴石柱點亮後打倒，召喚物散去；
// 重試（玩家倒下、離開戰場）時頭目、召喚物與共鳴石柱都重置。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
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
  allowDebugCommands: true,
};
const BOSS = 'boss_root_devourer';
const def = data.combat.enemies.get(BOSS)!;
const boss = def.boss!;
const pillars = boss.purify!.pillars;

function ok(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const events = handleCommand(state, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(state, events, ctx), events };
}

function fighting(hp = def.maxHp): { state: GameState; enemyId: string } {
  const start: GameState = { ...initialGameState(), quests: { quest_forest_007: { status: 'active' } } };
  const r = ok(start, { type: 'StartBossFight', boss: BOSS });
  const spawned = r.events.find((e) => e.type === 'EnemySpawned');
  if (spawned?.type !== 'EnemySpawned') throw new Error('沒有生成頭目');
  const enemies = new Map(r.state.enemies);
  enemies.set(spawned.enemyId, { ...enemies.get(spawned.enemyId)!, hp });
  return { state: { ...r.state, enemies }, enemyId: spawned.enemyId };
}

const summons = (s: GameState) => [...s.enemies.values()].filter((e) => e.kind === boss.summon!.enemy);
const hit = (s: GameState, enemyId: string) => ok(s, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' });

describe('根噬者的三個階段與重試', () => {
  it('血量跌破第二階段門檻時召喚幻霧螢靈，只召喚一次', () => {
    const { state, enemyId } = fighting(Math.ceil(def.maxHp * boss.phase2Below) + 1);
    const r = hit(state, enemyId);
    expect(summons(r.state)).toHaveLength(boss.summon!.count);
    expect(summons(hit(r.state, enemyId).state)).toHaveLength(boss.summon!.count);
  });

  it('淨化：三座石柱點亮後打倒，召喚物跟著散去、只結算一次', () => {
    const { state, enemyId } = fighting(Math.ceil(def.maxHp * boss.phase2Below) + 1);
    let s = hit(state, enemyId).state;
    s = hit({ ...s, enemies: new Map([...s.enemies].map(([k, e]) => [k, k === enemyId ? { ...e, hp: 2 } : e])) }, enemyId).state;
    expect(s.enemies.get(enemyId)?.purifying).toBe(true);
    const events: GameEvent[] = [];
    for (const id of pillars) {
      const r = ok(s, { type: 'ActivateObject', placementId: id });
      s = r.state;
      events.push(...r.events);
    }
    expect(events.filter((e) => e.type === 'BossDefeated')).toHaveLength(1);
    expect(s.enemies.size).toBe(0);
    expect(s.defeatedBosses).toContain(BOSS);
  });

  it('玩家倒下：頭目與召喚物回去，已點亮的共鳴石柱熄滅', () => {
    const { state, enemyId } = fighting(Math.ceil(def.maxHp * boss.phase2Below) + 1);
    let s = hit(state, enemyId).state;
    s = ok(s, { type: 'ActivateObject', placementId: pillars[0]! }).state;
    expect(s.objects.get(pillars[0]!)?.active).toBe(true);
    s = ok({ ...s, player: { ...s.player, hp: 1 } }, { type: 'EnemyStrike', enemyId, move: 'slam' }).state;
    expect(s.player.defeated).toBe(true);
    expect(s.enemies.size).toBe(0);
    expect(s.objects.get(pillars[0]!)?.active).toBeFalsy();
  });

  it('離開戰場結束戰鬥：同樣重置', () => {
    const { state, enemyId } = fighting(Math.ceil(def.maxHp * boss.phase2Below) + 1);
    let s = hit(state, enemyId).state;
    s = ok(s, { type: 'ActivateObject', placementId: pillars[1]! }).state;
    s = ok(s, { type: 'EndBossFight', boss: BOSS }).state;
    expect(s.enemies.size).toBe(0);
    expect(s.objects.get(pillars[1]!)?.active).toBeFalsy();
    // 重新開戰是滿血
    const again = ok(s, { type: 'StartBossFight', boss: BOSS }).events.find((e) => e.type === 'EnemySpawned');
    expect(again).toMatchObject({ hp: def.maxHp });
  });
});
