// 任務 8C：螢苔祕林的兩個任務（Bible §6.4）以實際資料走完一遍——琳娜的「不會發光的路」、奇奇的「把水還給森林」，
// 以及權威層的機關規則（點亮、移開、打開、修補、轉動）、水流喚醒苔蘚節點、任務獎勵讓苔冠空地的樹根退開。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameEvent, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { objectiveProgress, questStatus } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { canInteract } from '@/game-core/world/objects';
import { mapIdAt } from '@/game-core/world/maps';
import { terrainHeight } from '@/game-core/world/terrain';
import { waterwayFlow } from '@/game-core/world/waterway';
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
const quest1 = data.quests.get('quest_forest_001')!;
const quest2 = data.quests.get('quest_forest_002')!;
const waterway = data.waterways[0]!;
const LANTERNS = ['glowmoss_lantern_01', 'glowmoss_lantern_02', 'glowmoss_lantern_03'];
const NODES = ['glowmoss_moss_node_01', 'glowmoss_moss_node_02', 'glowmoss_moss_node_03'];

function run(state: GameState, cmd: GameCommand): { state: GameState; events: GameEvent[] } {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
}

function runAll(state: GameState, cmds: GameCommand[]): GameState {
  for (const cmd of cmds) {
    const r = run(state, cmd);
    const rejected = r.events.find((e) => e.type === 'CommandRejected');
    if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
    state = r.state;
  }
  return state;
}

function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}

/** 木橋修好、剛抵達螢苔祕林 */
function arrived(): GameState {
  const s = initialGameState();
  return { ...s, quests: { wood_for_bridge: { status: 'completed' }, repair_bridge: { status: 'completed' } } };
}

const npc = (id: string) => data.npcs.find((n) => n.id === id)!;
const talk = (state: GameState, id: string) => pickDialogue(npc(id).talk, state, condCtx);

describe('資料', () => {
  it('琳娜與奇奇站在螢苔祕林，所有新物件都在螢苔祕林', () => {
    for (const id of ['linna', 'kiki']) expect(mapIdAt(...npc(id).position)).toBe('glowmoss');
    for (const id of [...LANTERNS, ...NODES, ...waterway.blockers, waterway.wheel, 'glowmoss_crown_roots']) {
      const p = index.placement(id);
      expect(p, id).toBeDefined();
      expect(mapIdAt(p!.position[0], p!.position[2]), id).toBe('glowmoss');
    }
  });

  it('苔冠空地入口的樹根橫跨整個西側開口：樹根兩端外側都是走不上去的山脊', () => {
    const p = index.placement('glowmoss_crown_roots')!;
    const [spec] = index.colliders.query(p.position[0], p.position[2], 1).filter((c) => c.id === p.id);
    const box = spec!.normal[0]!.shape;
    if (box.kind !== 'box') throw new Error('樹根應為方塊碰撞');
    const half = box.halfExtents[0];
    const floor = terrainHeight(p.position[0], p.position[2]);
    // 樹根沿 Z 方向橫跨（yaw = π/2），兩端再往外 0.5 m 的地面要比入口高出一截
    for (const side of [-1, 1]) expect(terrainHeight(p.position[0], p.position[2] + side * (half + 0.5)) - floor, `side ${side}`).toBeGreaterThan(2.5);
    expect(box.halfExtents[1] * 2).toBeGreaterThan(3);
  });

  it('任務鏈：修好木橋 → 琳娜 → 奇奇', () => {
    expect(quest1.requires).toEqual(['repair_bridge']);
    expect(quest2.requires).toEqual(['quest_forest_001']);
    expect(questStatus(initialGameState(), quest1)).toBe('locked');
    expect(questStatus(arrived(), quest1)).toBe('available');
    expect(questStatus(arrived(), quest2)).toBe('locked');
  });
});

describe('quest_forest_001 不會發光的路', () => {
  it('接取前路燈不能點；接取後點亮三盞、交出螢苔 × 5 與月露草 × 3，領到月露藥膏，林緣小徑的霧散去', () => {
    let s = arrived();
    expect(talk(s, 'linna')).toBe('linna_intro');
    expect(rejection(s, { type: 'ActivateObject', placementId: LANTERNS[0]! })).toBe('quest-unavailable');
    const prefab = index.prefab('trail_lantern')!;
    expect(canInteract(prefab, undefined, () => false)).toBe(false);
    expect(canInteract(prefab, undefined, () => true)).toBe(true);

    s = runAll(s, [{ type: 'AcceptQuest', quest: 'quest_forest_001' }]);
    expect(talk(s, 'linna')).toBe('linna_forest1_progress');
    s = runAll(s, [
      ...LANTERNS.map((placementId): GameCommand => ({ type: 'ActivateObject', placementId })),
      { type: 'DebugGiveItems', items: [{ itemId: 'glow_moss', count: 6 }, { itemId: 'moondew_herb', count: 3 }] },
    ]);
    expect(rejection(s, { type: 'ActivateObject', placementId: LANTERNS[0]! })).toBe('already-active');
    expect(canInteract(prefab, s.objects.get(LANTERNS[0]!), () => true)).toBe(false);
    expect(objectiveProgress(s, quest1)).toEqual([
      { current: 5, target: 5 },
      { current: 3, target: 3 },
      { current: 3, target: 3 },
    ]);
    expect(talk(s, 'linna')).toBe('linna_forest1_turnin');

    const r = run(s, { type: 'TurnInQuest', quest: 'quest_forest_001' });
    expect(r.events.filter((e) => e.type === 'CommandRejected')).toEqual([]);
    s = r.state;
    expect(countItem(s.inventory, 'glow_moss')).toBe(1);
    expect(countItem(s.inventory, 'moondew_herb')).toBe(0);
    expect(countItem(s.inventory, 'moondew_salve')).toBe(2);
    expect(s.mist.moss_trail).toBe('clear');
    expect(talk(s, 'linna')).toBe('linna_after_path');
    expect(talk(s, 'kiki')).toBe('kiki_water_offer');
    expect(questStatus(s, quest2)).toBe('available');
  });

  it('路燈還沒點齊時不能回報', () => {
    let s = runAll(arrived(), [
      { type: 'AcceptQuest', quest: 'quest_forest_001' },
      { type: 'DebugGiveItems', items: [{ itemId: 'glow_moss', count: 5 }, { itemId: 'moondew_herb', count: 3 }] },
      { type: 'ActivateObject', placementId: LANTERNS[0]! },
    ]);
    expect(rejection(s, { type: 'TurnInQuest', quest: 'quest_forest_001' })).toBe('quest-incomplete');
    s = runAll(s, [{ type: 'ActivateObject', placementId: LANTERNS[1]! }]);
    expect(objectiveProgress(s, quest1)[2]).toEqual({ current: 2, target: 3 });
  });
});

describe('quest_forest_002 把水還給森林', () => {
  const afterQuest1 = (): GameState => ({ ...arrived(), quests: { ...arrived().quests, quest_forest_001: { status: 'completed' } } });
  const accepted = () => runAll(afterQuest1(), [{ type: 'AcceptQuest', quest: 'quest_forest_002' }]);
  const flow = (s: GameState) => waterwayFlow(waterway, s.objects);

  it('接取前：樹根、閘門、渠段都不能動；苔冠空地入口被樹根封住', () => {
    const s = afterQuest1();
    for (const id of ['glowmoss_channel_roots', 'glowmoss_water_gate_01']) expect(rejection(s, { type: 'ActivateObject', placementId: id })).toBe('quest-unavailable');
    expect(rejection(s, { type: 'RepairObject', placementId: 'glowmoss_channel_breach' })).toBe('quest-unavailable');
    expect(talk(s, 'kiki')).toBe('kiki_water_offer');
    const crown = index.colliders.query(index.placement('glowmoss_crown_roots')!.position[0], index.placement('glowmoss_crown_roots')!.position[2], 1);
    expect(crown.some((c) => c.id === 'glowmoss_crown_roots' && c.normal.length > 0 && c.alternate?.shapes.length === 0)).toBe(true);
  });

  it('移開樹根得到根纖維；水一路流到還沒打開的閘門', () => {
    let s = accepted();
    expect(flow(s).cleared).toBe(0);
    const r = run(s, { type: 'ActivateObject', placementId: 'glowmoss_channel_roots' });
    s = r.state;
    expect(countItem(s.inventory, 'root_fiber')).toBe(2);
    expect(flow(s)).toMatchObject({ cleared: 1, flowing: false, outlet: null });
    // 先開下游的閘門，水仍停在上游那座
    s = runAll(s, [{ type: 'ActivateObject', placementId: 'glowmoss_water_gate_02' }]);
    expect(flow(s).cleared).toBe(1);
    s = runAll(s, [{ type: 'ActivateObject', placementId: 'glowmoss_water_gate_01' }]);
    expect(flow(s).cleared).toBe(3);
    expect(objectiveProgress(s, quest2).slice(0, 2)).toEqual([
      { current: 1, target: 1 },
      { current: 2, target: 2 },
    ]);
  });

  it('修補渠段要石頭 × 4 與根纖維 × 2；修好的瞬間水流到木輪，第一塊苔蘚被喚醒', () => {
    let s = runAll(accepted(), [
      { type: 'ActivateObject', placementId: 'glowmoss_channel_roots' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_01' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_02' },
    ]);
    expect(rejection(s, { type: 'RepairObject', placementId: 'glowmoss_channel_breach' })).toBe('missing-materials');
    s = runAll(s, [{ type: 'DebugGiveItems', items: [{ itemId: 'stone', count: 4 }] }]);
    const r = run(s, { type: 'RepairObject', placementId: 'glowmoss_channel_breach' });
    expect(r.events).toContainEqual({ type: 'ObjectActivated', placementId: NODES[0], source: 'water' });
    s = r.state;
    expect(countItem(s.inventory, 'root_fiber')).toBe(0);
    expect(flow(s)).toMatchObject({ flowing: true, turn: 0, outlet: NODES[0] });
    expect(objectiveProgress(s, quest2)[3]).toEqual({ current: 1, target: 3 });
  });

  it('轉動木輪把水引到另外兩塊苔蘚；三塊都醒了才能回報。回報後苔冠空地的樹根退開、林地的霧散去', () => {
    let s = runAll(accepted(), [
      { type: 'ActivateObject', placementId: 'glowmoss_channel_roots' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_01' },
      { type: 'ActivateObject', placementId: 'glowmoss_water_gate_02' },
      { type: 'DebugGiveItems', items: [{ itemId: 'stone', count: 4 }] },
      { type: 'RepairObject', placementId: 'glowmoss_channel_breach' },
    ]);
    expect(talk(s, 'kiki')).toBe('kiki_water_progress');
    let r = run(s, { type: 'TurnObject', placementId: waterway.wheel });
    expect(r.events).toEqual([
      { type: 'ObjectTurned', placementId: waterway.wheel, turn: 1 },
      { type: 'ObjectActivated', placementId: NODES[1], source: 'water' },
    ]);
    s = r.state;
    expect(rejection(s, { type: 'TurnInQuest', quest: 'quest_forest_002' })).toBe('quest-incomplete');
    s = runAll(s, [{ type: 'TurnObject', placementId: waterway.wheel }]);
    expect(objectiveProgress(s, quest2).every((p) => p.current === p.target)).toBe(true);
    // 轉回已經醒的節點：不再重複喚醒，木輪回到 0（存檔不記錄預設值）
    r = run(s, { type: 'TurnObject', placementId: waterway.wheel });
    expect(r.events).toEqual([{ type: 'ObjectTurned', placementId: waterway.wheel, turn: 0 }]);
    s = r.state;
    expect(s.objects.get(waterway.wheel)?.turn).toBeUndefined();
    expect(talk(s, 'kiki')).toBe('kiki_water_turnin');

    r = run(s, { type: 'TurnInQuest', quest: 'quest_forest_002' });
    expect(r.events).toContainEqual({ type: 'ObjectActivated', placementId: 'glowmoss_crown_roots', source: 'quest' });
    s = r.state;
    expect(questStatus(s, quest2)).toBe('completed');
    expect(countItem(s.inventory, 'herb_potion')).toBe(2);
    expect(s.mist.moss_glade).toBe('clear');
    expect(s.objects.get('glowmoss_crown_roots')?.active).toBe(true);
    // 退開的樹根不再能互動
    expect(canInteract(index.prefab('crown_roots')!, s.objects.get('glowmoss_crown_roots'))).toBe(false);
    expect(talk(s, 'kiki')).toBe('kiki_guard_offer');
    expect(talk(s, 'linna')).toBe('linna_after_water');
  });

  it('機關的狀態存檔後讀回相同（v13：active、turn）', () => {
    const s = runAll(accepted(), [
      { type: 'ActivateObject', placementId: 'glowmoss_channel_roots' },
      { type: 'TurnObject', placementId: waterway.wheel },
      { type: 'TurnObject', placementId: waterway.wheel },
    ]);
    const saved = JSON.parse(JSON.stringify(toSaveData(s, { position: { x: 2000, y: 0, z: 0 }, facingYaw: 0 }, new Date(0))));
    const loaded = fromSaveData(saved, { world: index, items: data.items, combat: data.combat, buildables: data.buildables });
    expect(loaded.warnings).toEqual([]);
    expect(loaded.state.objects.get('glowmoss_channel_roots')).toEqual({ placementId: 'glowmoss_channel_roots', active: true });
    expect(loaded.state.objects.get(waterway.wheel)?.turn).toBe(2);
  });

  it('世界地圖：進行中時標出還沒啟動的機關與還沒修好的渠段', () => {
    const s = runAll(accepted(), [{ type: 'ActivateObject', placementId: 'glowmoss_channel_roots' }]);
    const markers = questMarkers(s, data.quests, { npcPosition: () => null, placement: (id) => index.placement(id), spawners: [] }).filter((m) => m.questId === 'quest_forest_002');
    const at = (id: string) => index.placement(id)!.position;
    const has = (id: string) => markers.some((m) => m.x === at(id)[0] && m.z === at(id)[2]);
    expect(has('glowmoss_channel_roots')).toBe(false);
    for (const id of ['glowmoss_water_gate_01', 'glowmoss_water_gate_02', 'glowmoss_channel_breach', ...NODES]) expect(has(id), id).toBe(true);
  });
});
