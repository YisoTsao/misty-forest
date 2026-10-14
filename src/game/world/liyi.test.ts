// 任務 9E-1：璃漪，回聲鯉龍（Bible §7.5）——任務中才開戰、倒影減傷（只有真身顯形時打得痛）、
// 蓄力時轉動神殿兩側的水鏡讓牠暈眩（真身顯形）、三招的預兆與命中、擊敗後完成任務。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { bossStance, createBossAi, stepBossAi, stunBoss } from '@/game-core/combat/bossAi';
import { createEnemyAi } from '@/game-core/combat/enemyAi';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { isBuildableUnlocked } from '@/game-core/build/build';
import { countItem } from '@/game-core/inventory/inventory';
import { mapIdAt } from '@/game-core/world/maps';
import { regionAt } from '@/game-core/world/regions';
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
const BOSS = 'boss_liyi_echo_koi';
const Q = 'quest_lake_003';
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
const rejection = (state: GameState, cmd: GameCommand) => {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
};
const opened = (): GameState => ({ ...initialGameState(), quests: { quest_forest_003: { status: 'completed' }, quest_lake_001: { status: 'completed' }, quest_lake_002: { status: 'completed' } } });
const eve = data.npcs.find((n) => n.id === 'eve')!;
const talk = (s: GameState) => pickDialogue(eve.talk, s, { quests: data.quests });
const talkTo = (id: string, s: GameState) => pickDialogue(data.npcs.find((n) => n.id === id)!.talk, s, { quests: data.quests });
const CORE = 'mirrorlake_temple_core';
function fighting(): { state: GameState; enemyId: string } {
  const accepted = ok(opened(), { type: 'AcceptQuest', quest: Q }).state;
  const r = ok(accepted, { type: 'StartBossFight', boss: BOSS });
  const spawned = r.events.find((e) => e.type === 'EnemySpawned');
  if (spawned?.type !== 'EnemySpawned') throw new Error('沒有生成頭目');
  return { state: r.state, enemyId: spawned.enemyId };
}
const damage = (events: GameEvent[]) => events.find((e) => e.type === 'EnemyDamaged')?.amount ?? NaN;

describe('璃漪', () => {
  it('戰場在澄鏡湖的水鏡神殿；兩側的水鏡在戰場外圈、重試點在戰場外', () => {
    expect(mapIdAt(CX, CZ)).toBe('mirrorlake');
    expect(regionAt(data.regions, CX, CZ)).toBe('mirror_temple');
    for (const id of boss.stun!.mirrors) {
      const m = index.placement(id)!;
      const d = Math.hypot(m.position[0] - CX, m.position[2] - CZ);
      expect(d).toBeGreaterThan(boss.arena.radius);
      expect(d).toBeLessThan(boss.arena.radius + 6);
    }
    expect(Math.hypot(boss.retryAt[0] - CX, boss.retryAt[1] - CZ)).toBeGreaterThan(boss.arena.radius);
  });

  it('伊芙在水鏡謎題之後交付；任務進行中才開戰', () => {
    expect(talk(opened())).toBe('eve_guardian_offer');
    expect(rejection(opened(), { type: 'StartBossFight', boss: BOSS })).not.toBeNull();
    const accepted = ok(opened(), { type: 'AcceptQuest', quest: Q }).state;
    expect(talk(accepted)).toBe('eve_guardian_progress');
    expect(rejection(accepted, { type: 'StartBossFight', boss: BOSS })).toBeNull();
  });

  it('倒影：平常打到大多是倒影（傷害 × 0.25），真身顯形（暈眩）時正常、甚至更痛', () => {
    const { state, enemyId } = fighting();
    const attack = 'sword_slash_diag';
    const veiled = damage(handleCommand(state, { type: 'AttackEnemy', enemyId, attack }, ctx));
    const revealed = damage(handleCommand(state, { type: 'AttackEnemy', enemyId, attack, stance: 'recover' }, ctx));
    expect(veiled).toBeLessThan(revealed * 0.3);
    expect(revealed).toBeGreaterThan(0);
  });

  it('蓄力時轉動水鏡：暈眩（姿態變成破綻）；不是蓄力時沒有用', () => {
    const ai = createEnemyAi(boss.home[0], boss.home[1], 0);
    const b = createBossAi();
    const input = (dt: number, force?: 'spikes' | 'spores' | 'slam') => ({ dt, player: { x: CX - 5, z: CZ }, hpRatio: 1, random: () => 0.3, ...(force ? { force } : {}) });
    stepBossAi(ai, b, boss, { ...input(boss.introSec + 0.01), player: { ...input(0).player, alive: true } });
    expect(stunBoss(b, boss)).toBe(false);
    for (let i = 0; i < 80 && b.state !== 'spikes'; i++) stepBossAi(ai, b, boss, { ...input(0.05, 'spikes'), player: { ...input(0).player, alive: true } });
    expect(b.state).toBe('spikes');
    expect(stunBoss(b, boss)).toBe(true);
    expect(bossStance(b)).toBe('recover');
  });

  it('擊敗（顯形時打）後喚醒神殿中央的潮之共鳴裝置（擊敗前不行）；回報伊芙後神殿的迷霧散去、湖泊家園裝飾配方解鎖', () => {
    const fight = fighting();
    const enemyId = fight.enemyId;
    let state = fight.state;
    expect(rejection(state, { type: 'ActivateObject', placementId: CORE })).not.toBeNull();
    for (let i = 0; i < 200 && state.enemies.has(enemyId); i++) state = ok(state, { type: 'AttackEnemy', enemyId, attack: 'sword_slash_diag', stance: 'recover' }).state;
    expect(state.enemies.has(enemyId)).toBe(false);
    expect(state.defeatedBosses).toContain(BOSS);
    expect(talkTo('liyi', state)).toBe('liyi_core');
    expect(talk(state)).toBe('eve_guardian_progress');
    expect(isBuildableUnlocked(data.buildables.get('mirror_lamp')!, state.quests)).toBe(false);
    state = ok(state, { type: 'ActivateObject', placementId: CORE }).state;
    expect(countItem(state.inventory, 'tide_resonance')).toBe(1);
    expect(state.objects.get(CORE)?.active).toBe(true);
    expect(talk(state)).toBe('eve_guardian_turnin');
    state = ok(state, { type: 'TurnInQuest', quest: Q }).state;
    expect(state.quests[Q]?.status).toBe('completed');
    expect(state.mist.mirror_temple).toBe('clear');
    expect(talk(state)).toBe('eve_after_guardian');
    expect(talkTo('liyi', state)).toBe('liyi_restored');
    expect(isBuildableUnlocked(data.buildables.get('mirror_lamp')!, state.quests)).toBe(true);
    expect(isBuildableUnlocked(data.buildables.get('reed_planter')!, state.quests)).toBe(true);
  });

  it('戰後的璃漪只在擊敗後出現在神殿', () => {
    const liyi = data.npcs.find((n) => n.id === 'liyi')!;
    expect(mapIdAt(liyi.position[0], liyi.position[1])).toBe('mirrorlake');
    expect(liyi.visible).toEqual({ type: 'bossDefeated', boss: BOSS });
  });
});
