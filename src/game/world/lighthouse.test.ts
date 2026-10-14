// 任務 7D：quest_dawn_003「燈塔的最後一盞光」（Bible §5.4）以實際資料走完一遍——米菈交付、燈罩碎片只在任務中能撿、
// 依序：趕走迷霧噗啾 → 淨化迷霧核心 → 裝回燈罩點亮燈塔；回報後取得晨之共鳴、高地的霧散去、往螢苔祕林的林道開啟。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickCompanionHint } from '@/game-core/companion/companion';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { isQuestReady, objectiveProgress, questStatus } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { mapIdAt } from '@/game-core/world/maps';
import { canInteract } from '@/game-core/world/objects';
import { LIGHTHOUSE, terrainHeight } from '@/game-core/world/terrain';
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
  waterways: data.waterways,
  allowDebugCommands: true,
};
const condCtx = { quests: data.quests };
const quest = data.quests.get('quest_dawn_003')!;
const LIGHTHOUSE_LAMP = 'highland_lighthouse_lamp';
const MIST_CORE = 'highland_mist_core';
const SHARDS = ['highland_lantern_shard_01', 'highland_lantern_shard_02', 'highland_lantern_shard_03'];

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

const elder = data.npcs.find((n) => n.id === 'elder')!;
const talk = (state: GameState) => pickDialogue(elder.talk, state, condCtx);

/** 林緣的迷霧散去（雷歐的任務完成）：可以接燈塔任務 */
function afterForest(): GameState {
  const s = initialGameState();
  return {
    ...s,
    quests: { wood_for_bridge: { status: 'completed' }, repair_bridge: { status: 'completed' }, clear_forest: { status: 'completed' } },
    mist: { ...s.mist, forest: 'clear' },
    companion: { unlocked: true },
  };
}

function accepted(): GameState {
  return ok(afterForest(), { type: 'AcceptQuest', quest: 'quest_dawn_003' }).state;
}

/** 燈塔旁生出一隻迷霧噗啾並打倒 */
function defeatWisp(state: GameState, n: number): GameState {
  const enemyId = `lighthouse_wisps#t${n}`;
  state = applyEvents(state, [{ type: 'EnemySpawned', enemyId, kind: 'mist_wisp', spawner: 'lighthouse_wisps', hp: data.combat.enemies.get('mist_wisp')!.maxHp }], ctx);
  for (let i = 0; i < 20 && state.enemies.has(enemyId); i++) state = ok({ ...state, player: { ...state.player, mp: 100 } }, { type: 'AttackEnemy', enemyId, attack: 'spell_starlight_burst' }).state;
  return state;
}

function pickShards(state: GameState): GameState {
  for (const id of SHARDS) state = ok(state, { type: 'HarvestObject', placementId: id }).state;
  return state;
}

describe('資料', () => {
  it('米菈交付、前置是雷歐的林緣任務；三個目標依序是噗啾、迷霧核心、燈塔', () => {
    expect(quest.giver).toBe('elder');
    expect(quest.requires).toEqual(['clear_forest']);
    expect(quest.objectives.map((o) => o.type)).toEqual(['defeat', 'activate', 'repair']);
  });

  it('燈籠室在燈塔頂、迷霧核心在燈塔旁、三片碎片都在北邊懸崖上的高地', () => {
    const lamp = index.placement(LIGHTHOUSE_LAMP)!;
    expect(Math.hypot(lamp.position[0] - LIGHTHOUSE.x, lamp.position[2] - LIGHTHOUSE.z)).toBeLessThan(0.01);
    expect(lamp.position[1] - terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z)).toBeGreaterThan(14);
    const core = index.placement(MIST_CORE)!;
    expect(Math.hypot(core.position[0] - LIGHTHOUSE.x, core.position[2] - LIGHTHOUSE.z)).toBeLessThan(15);
    for (const id of SHARDS) {
      const p = index.placement(id)!;
      expect(mapIdAt(p.position[0], p.position[2]), id).toBe('dawnvale');
      expect(p.position[2], id).toBeLessThan(-110);
    }
    // 燈塔附近有迷霧噗啾的生成點；高地的霧散去後不再生成
    const spawner = data.combat.spawners.find((s) => s.id === 'lighthouse_wisps')!;
    expect(spawner.enemy).toBe('mist_wisp');
    expect(spawner.budget.clear).toBe(0);
  });

  it('往螢苔祕林的林道入口：燈塔任務完成後才能通過', () => {
    const gate = index.placement('dawn_gate_glowmoss')!;
    expect(index.prefab(gate.prefabId)?.enter?.requires).toEqual({ questCompleted: 'quest_dawn_003' });
  });
});

describe('quest_dawn_003 燈塔的最後一盞光', () => {
  it('林緣的霧散去後米菈交付；接取前撿不到燈罩碎片、碰不到迷霧核心與燈塔', () => {
    const s = afterForest();
    expect(questStatus(s, quest)).toBe('available');
    expect(talk(s)).toBe('elder_lighthouse_offer');
    expect(rejection(s, { type: 'HarvestObject', placementId: SHARDS[0]! })).toBe('quest-unavailable');
    expect(canInteract(index.prefab('lantern_shard')!, undefined, () => false)).toBe(false);
    expect(rejection(s, { type: 'ActivateObject', placementId: MIST_CORE })).toBe('quest-unavailable');
    expect(rejection(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP })).toBe('quest-unavailable');
    expect(talk(accepted())).toBe('elder_lighthouse_progress');
  });

  it('燈罩碎片：任務中撿起來各得一片、不會重生', () => {
    let s = accepted();
    expect(canInteract(index.prefab('lantern_shard')!, undefined, (q) => q === 'quest_dawn_003')).toBe(true);
    s = pickShards(s);
    expect(countItem(s.inventory, 'lantern_shard')).toBe(3);
    expect(rejection(s, { type: 'HarvestObject', placementId: SHARDS[0]! })).toBe('already-harvested');
    s = ok(s, { type: 'AdvanceTime', dt: 3600 }).state;
    expect(s.objects.get(SHARDS[0]!)?.harvested).toBe(true);
  });

  it('依序：噗啾沒趕走前不能淨化核心；核心沒淨化前不能點燈', () => {
    let s = pickShards(accepted());
    expect(rejection(s, { type: 'ActivateObject', placementId: MIST_CORE })).toBe('out-of-order');
    expect(rejection(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP })).toBe('out-of-order');
    for (let i = 0; i < 3; i++) s = defeatWisp(s, i);
    expect(objectiveProgress(s, quest)[0]).toEqual({ current: 3, target: 3 });
    expect(rejection(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP })).toBe('out-of-order');
    s = ok(s, { type: 'ActivateObject', placementId: MIST_CORE }).state;
    expect(s.objects.get(MIST_CORE)?.active).toBe(true);
    const r = ok(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP });
    expect(r.events).toEqual([
      { type: 'ItemsRemoved', items: [{ itemId: 'lantern_shard', count: 3 }], reason: 'repair' },
      { type: 'ObjectRepaired', placementId: LIGHTHOUSE_LAMP },
    ]);
    expect(isQuestReady(r.state, quest)).toBe(true);
    expect(talk(r.state)).toBe('elder_lighthouse_turnin');
    expect(pickCompanionHint(data.companion, r.state, condCtx)).toBe('companion.hint.dawn3Ready');
  });

  it('碎片不夠時點不了燈（缺少材料）', () => {
    let s = accepted();
    s = ok(s, { type: 'HarvestObject', placementId: SHARDS[0]! }).state;
    for (let i = 0; i < 3; i++) s = defeatWisp(s, i);
    s = ok(s, { type: 'ActivateObject', placementId: MIST_CORE }).state;
    expect(rejection(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP })).toBe('missing-materials');
  });

  it('回報：晨之共鳴、晨光護符、星光碎屑、高地的霧散去；之後米菈的對話換成完成後', () => {
    let s = pickShards(accepted());
    for (let i = 0; i < 3; i++) s = defeatWisp(s, i);
    s = ok(s, { type: 'ActivateObject', placementId: MIST_CORE }).state;
    s = ok(s, { type: 'RepairObject', placementId: LIGHTHOUSE_LAMP }).state;
    s = ok(s, { type: 'TurnInQuest', quest: 'quest_dawn_003' }).state;
    expect(questStatus(s, quest)).toBe('completed');
    expect(countItem(s.inventory, 'dawn_resonance')).toBe(1);
    expect(countItem(s.inventory, 'dawn_charm')).toBe(1);
    expect(s.mist.highland).toBe('clear');
    expect(talk(s)).toBe('elder_lighthouse_done');
    // 存讀檔
    const loaded = fromSaveData(toSaveData(s, { position: { x: -30, y: 10, z: -120 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.state.objects.get(LIGHTHOUSE_LAMP)?.repaired).toBe(true);
    expect(loaded.state.objects.get(MIST_CORE)?.active).toBe(true);
    expect(loaded.state.quests.quest_dawn_003).toEqual({ status: 'completed' });
  });

  it('世界地圖：標出迷霧核心與燈塔', () => {
    const s = accepted();
    const marks = questMarkers(s, data.quests, { npcPosition: () => null, placement: (id) => index.placement(id), spawners: data.combat.spawners }).filter((m) => m.questId === 'quest_dawn_003');
    for (const id of [MIST_CORE, LIGHTHOUSE_LAMP]) {
      const p = index.placement(id)!.position;
      expect(marks.some((m) => m.x === p[0] && m.z === p[2]), id).toBe(true);
    }
  });
});
