// 任務 8D-2：quest_forest_003「苔冠下的守衛」（Bible §6.4、§6.5）以實際資料走完一遍——奇奇交付、
// 接了任務才開戰、守衛平靜前碰不到根源石、戰後的苔咚 NPC、啟動根源石取得芽之共鳴、回報後林間水道的樹根退開。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickCompanionHint } from '@/game-core/companion/companion';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { landmarkShown, questMarkers } from '@/game-core/map/markers';
import { isQuestReady, objectiveProgress, questStatus } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { mapIdAt } from '@/game-core/world/maps';
import { canInteract } from '@/game-core/world/objects';
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
  waterways: data.waterways,
  allowDebugCommands: true,
};
const condCtx = { quests: data.quests };
const BOSS = 'boss_moss_thump';
const STONE = 'glowmoss_root_stone';
const LAKE_ROOTS = 'glowmoss_lake_roots';
const quest3 = data.quests.get('quest_forest_003')!;
const boss = data.combat.enemies.get(BOSS)!.boss!;

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

const npc = (id: string) => data.npcs.find((n) => n.id === id)!;
const talk = (state: GameState, id: string) => pickDialogue(npc(id).talk, state, condCtx);
const visible = (state: GameState, id: string) => evaluateCondition(npc(id).visible, state, condCtx);

/** 水道任務已完成（苔冠空地入口打開） */
function afterWater(): GameState {
  return { ...initialGameState(), quests: { quest_forest_001: { status: 'completed' }, quest_forest_002: { status: 'completed' } }, companion: { unlocked: true } };
}

/** 打倒苔咚：開戰、注滿三個水槽、用星光衝擊打到倒下 */
function defeatBoss(state: GameState): GameState {
  const r = ok(state, { type: 'StartBossFight', boss: BOSS });
  const spawned = r.events.find((e) => e.type === 'EnemySpawned');
  if (spawned?.type !== 'EnemySpawned') throw new Error('沒有生成頭目');
  state = r.state;
  for (const id of boss.troughs) state = ok(state, { type: 'ActivateObject', placementId: id }).state;
  for (let i = 0; i < 200 && state.enemies.has(spawned.enemyId); i++) {
    state = ok({ ...state, player: { ...state.player, mp: 100 } }, { type: 'AttackEnemy', enemyId: spawned.enemyId, attack: 'spell_starlight_burst' }).state;
  }
  if (!state.defeatedBosses.includes(BOSS)) throw new Error('沒有打倒苔咚');
  return state;
}

describe('資料', () => {
  it('奇奇交付、前置是水道任務；目標是讓苔咚平靜下來、再啟動根源石', () => {
    expect(quest3.giver).toBe('kiki');
    expect(quest3.requires).toEqual(['quest_forest_002']);
    expect(quest3.objectives.map((o) => o.type)).toEqual(['boss', 'activate']);
    expect(boss.requires).toEqual({ questActive: 'quest_forest_003' });
  });

  it('根源石在苔冠空地的戰場內、菌樹後面；戰後的苔咚與林間水道都在螢苔祕林', () => {
    const stone = index.placement(STONE)!;
    const [cx, cz] = boss.arena.center;
    expect(regionAt(data.regions, stone.position[0], stone.position[2])).toBe('moss_crown');
    expect(Math.hypot(stone.position[0] - cx, stone.position[2] - cz)).toBeLessThan(boss.arena.radius);
    // 從入口（西側）看過去在菌樹的另一邊
    expect(stone.position[0]).toBeGreaterThan(cx);
    expect(index.prefab(stone.prefabId)?.activate).toMatchObject({ quest: 'quest_forest_003', afterBoss: BOSS });
    expect(mapIdAt(...npc('moss_thump').position)).toBe('glowmoss');
    const roots = index.placement(LAKE_ROOTS)!;
    expect(mapIdAt(roots.position[0], roots.position[2])).toBe('glowmoss');
    expect(data.landmarks.find((l) => l.id === 'lake_channel')?.requires).toEqual({ questCompleted: 'quest_forest_003' });
    // 芽之共鳴是主線關鍵物品：固定發放
    expect(data.items.get('seed_resonance_bud')?.category).toBe('quest');
    expect(data.lootTables.get('root_stone_resonance')?.drops).toEqual([{ itemId: 'seed_resonance_bud', min: 1, max: 1 }]);
  });
});

describe('quest_forest_003 苔冠下的守衛', () => {
  it('水道任務完成後奇奇交付；沒接任務走進空地不開戰', () => {
    const s = afterWater();
    expect(questStatus(s, quest3)).toBe('available');
    expect(talk(s, 'kiki')).toBe('kiki_guard_offer');
    expect(rejection(s, { type: 'StartBossFight', boss: BOSS })).toBe('quest-unavailable');
    const accepted = ok(s, { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    expect(talk(accepted, 'kiki')).toBe('kiki_guard_progress');
    expect(rejection(accepted, { type: 'StartBossFight', boss: BOSS })).toBeNull();
  });

  it('苔咚平靜下來之前碰不到根源石，苔咚也還不是 NPC', () => {
    const s = ok(afterWater(), { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    expect(rejection(s, { type: 'ActivateObject', placementId: STONE })).toBe('boss-not-defeated');
    expect(visible(s, 'moss_thump')).toBe(false);
    expect(objectiveProgress(s, quest3)).toEqual([
      { current: 0, target: 1 },
      { current: 0, target: 1 },
    ]);
    // 沒接任務時連互動提示都沒有
    expect(canInteract(index.prefab('root_stone')!, undefined, () => false)).toBe(false);
  });

  it('戰後：第一個目標完成、苔咚縮小成 NPC 守在菌樹下；啟動根源石取得芽之共鳴，可以回報', () => {
    let s = ok(afterWater(), { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    s = defeatBoss(s);
    expect(objectiveProgress(s, quest3)[0]).toEqual({ current: 1, target: 1 });
    expect(visible(s, 'moss_thump')).toBe(true);
    expect(talk(s, 'moss_thump')).toBe('moss_thump_stone');
    expect(pickCompanionHint(data.companion, s, condCtx)).toBe('companion.hint.forest3Stone');
    const r = ok(s, { type: 'ActivateObject', placementId: STONE });
    expect(r.events).toEqual([
      { type: 'ObjectActivated', placementId: STONE, source: 'player' },
      { type: 'ItemsGained', items: [{ itemId: 'seed_resonance_bud', count: 1 }], source: STONE },
    ]);
    s = r.state;
    expect(rejection(s, { type: 'ActivateObject', placementId: STONE })).toBe('already-active');
    expect(isQuestReady(s, quest3)).toBe(true);
    expect(talk(s, 'kiki')).toBe('kiki_guard_turnin');
    expect(talk(s, 'moss_thump')).toBe('moss_thump_restored');
    expect(pickCompanionHint(data.companion, s, condCtx)).toBe('companion.hint.forest3Ready');
  });

  it('回報：苔蘚披肩布料與星光碎屑、苔冠空地的霧散去、林間水道的樹根退開、地圖標出往澄鏡湖的水道', () => {
    let s = ok(afterWater(), { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    s = ok(defeatBoss(s), { type: 'ActivateObject', placementId: STONE }).state;
    const lake = data.landmarks.find((l) => l.id === 'lake_channel')!;
    expect(landmarkShown(lake, s.quests)).toBe(false);
    const shards = countItem(s.inventory, 'starlight_shard');
    const r = ok(s, { type: 'TurnInQuest', quest: 'quest_forest_003' });
    expect(r.events).toContainEqual({ type: 'ObjectActivated', placementId: LAKE_ROOTS, source: 'quest' });
    s = r.state;
    expect(questStatus(s, quest3)).toBe('completed');
    expect(countItem(s.inventory, 'moss_shawl_cloth')).toBe(1);
    expect(countItem(s.inventory, 'starlight_shard')).toBe(shards + 3);
    expect(countItem(s.inventory, 'seed_resonance_bud')).toBe(1);
    expect(s.mist.moss_crown).toBe('clear');
    expect(s.objects.get(LAKE_ROOTS)?.active).toBe(true);
    expect(landmarkShown(lake, s.quests)).toBe(true);
    expect(talk(s, 'kiki')).toBe('kiki_after_guard');
    expect(talk(s, 'moss_thump')).toBe('moss_thump_restored');
    // 不會再開戰（苔咚已經是朋友了）
    expect(rejection(s, { type: 'StartBossFight', boss: BOSS })).toBe('already-defeated');
  });

  it('舊存檔：接任務前就打倒了苔咚（8D-1），接了以後第一個目標直接算完成', () => {
    const s = ok({ ...afterWater(), defeatedBosses: [BOSS] }, { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    expect(objectiveProgress(s, quest3)[0]).toEqual({ current: 1, target: 1 });
    expect(rejection(s, { type: 'ActivateObject', placementId: STONE })).toBeNull();
  });

  it('世界地圖：還沒打倒時標出戰場，打倒後只標根源石', () => {
    let s = ok(afterWater(), { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    const marks = (st: GameState) =>
      questMarkers(st, data.quests, { npcPosition: () => null, placement: (id) => index.placement(id), spawners: data.combat.spawners }).filter((m) => m.questId === 'quest_forest_003');
    const stone = index.placement(STONE)!.position;
    const spawner = data.combat.spawners.find((sp) => sp.enemy === BOSS)!;
    expect(marks(s)).toContainEqual(expect.objectContaining({ x: spawner.center[0], z: spawner.center[1] }));
    s = defeatBoss(s);
    expect(marks(s)).toEqual([{ questId: 'quest_forest_003', kind: 'objective', x: stone[0], z: stone[2] }]);
  });

  it('存檔後讀回：任務進度、已擊敗的頭目、根源石與水道樹根的狀態相同', () => {
    let s = ok(afterWater(), { type: 'AcceptQuest', quest: 'quest_forest_003' }).state;
    s = ok(defeatBoss(s), { type: 'ActivateObject', placementId: STONE }).state;
    s = ok(s, { type: 'TurnInQuest', quest: 'quest_forest_003' }).state;
    const loaded = fromSaveData(toSaveData(s, { position: { x: 2090, y: 2, z: 46 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.state.quests.quest_forest_003).toEqual({ status: 'completed' });
    expect(loaded.state.defeatedBosses).toEqual([BOSS]);
    expect(loaded.state.objects.get(STONE)?.active).toBe(true);
    expect(loaded.state.objects.get(LAKE_ROOTS)?.active).toBe(true);
  });
});
