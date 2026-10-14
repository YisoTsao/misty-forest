// 任務 7K：quest_dawn_005「花園第一顆種子」（Bible §21.2、§22.1）——桃樂在木橋修好後出現、接取拿到種子、
// 花圃要接了任務才能蓋、蓋好就算種下（建造目標）、依遊戲時間長成三個階段、鬆土可以挖且會重生、存讀檔保留種下的時間。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { BUILD_AREA, growthStage, isBuildableUnlocked } from '@/game-core/build/build';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { addItems, countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { isQuestReady, objectiveProgress } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
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
const condCtx = { quests: data.quests };
const Q = 'quest_dawn_005';
const quest = data.quests.get(Q)!;
const plot = data.buildables.get('garden_plot')!;
const tao = data.npcs.find((n) => n.id === 'tao')!;

function ok(state: GameState, cmd: GameCommand) {
  const events = handleCommand(state, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(state, events, ctx), events };
}
function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}
function bridged(): GameState {
  return { ...initialGameState(), quests: { wood_for_bridge: { status: 'completed' }, repair_bridge: { status: 'completed' } } };
}
const place = { type: 'PlaceBuilding' as const, buildable: 'garden_plot', x: BUILD_AREA.x + 1.5, z: BUILD_AREA.z, yaw: 0 };
function materials(s: GameState): GameState {
  return { ...s, inventory: addItems(s.inventory, [{ itemId: 'wood', count: 4 }, { itemId: 'loose_soil', count: 3 }], data.items)! };
}

describe('quest_dawn_005 花園第一顆種子', () => {
  it('桃樂在木橋修好後出現；接取拿到兩顆種子', () => {
    expect(evaluateCondition(tao.visible, initialGameState(), condCtx)).toBe(false);
    expect(pickDialogue(tao.talk, bridged(), condCtx)).toBe('tao_garden_offer');
    const s = ok(bridged(), { type: 'AcceptQuest', quest: Q }).state;
    expect(countItem(s.inventory, 'wildflower_seed')).toBe(2);
  });

  it('花圃要接了任務才會出現在建造選單、才能蓋', () => {
    expect(isBuildableUnlocked(plot, bridged().quests)).toBe(false);
    expect(rejection(materials(bridged()), place)).toBe('recipe-locked');
    const s = ok(bridged(), { type: 'AcceptQuest', quest: Q }).state;
    expect(isBuildableUnlocked(plot, s.quests)).toBe(true);
  });

  it('鬆土：田邊挖得到、會重生', () => {
    const r = ok(initialGameState(), { type: 'HarvestObject', placementId: 'farm_soil_mound_01' });
    expect(countItem(r.state.inventory, 'loose_soil')).toBeGreaterThanOrEqual(1);
    expect(r.state.objects.get('farm_soil_mound_01')?.respawnAt).toBeGreaterThan(0);
  });

  it('放下花圃就算種下：扣木材、鬆土、一顆種子；記錄種下的時間；可以回報', () => {
    let s = ok(bridged(), { type: 'AcceptQuest', quest: Q }).state;
    s = { ...materials(s), time: 1000 };
    expect(objectiveProgress(s, quest)).toEqual([{ current: 0, target: 1 }]);
    s = ok(s, place).state;
    expect(s.buildings[0]).toMatchObject({ buildable: 'garden_plot', placedAt: 1000 });
    expect(countItem(s.inventory, 'wildflower_seed')).toBe(1);
    expect(countItem(s.inventory, 'loose_soil')).toBe(0);
    expect(isQuestReady(s, quest)).toBe(true);
    expect(pickDialogue(tao.talk, s, condCtx)).toBe('tao_garden_turnin');
    s = ok(s, { type: 'TurnInQuest', quest: Q }).state;
    expect(countItem(s.inventory, 'wildflower_seed')).toBe(4);
  });

  it('依遊戲時間長大：剛種下、長葉與花苞、開花；舊存檔沒有種下時間的直接是開花', () => {
    const b = { id: 'b', buildable: 'garden_plot', x: 0, z: 0, yaw: 0, placedAt: 100 };
    const [t1, t2] = plot.growth!.seconds;
    expect(growthStage(plot, b, 100)).toBe(0);
    expect(growthStage(plot, b, 100 + t1!)).toBe(1);
    expect(growthStage(plot, b, 100 + t2!)).toBe(2);
    expect(growthStage(plot, { ...b, placedAt: undefined }, 0)).toBe(2);
  });

  it('世界地圖標出家園小島；存讀檔保留種下的時間', () => {
    let s = ok(bridged(), { type: 'AcceptQuest', quest: Q }).state;
    const marks = questMarkers(s, data.quests, { npcPosition: () => null, placement: () => undefined, spawners: [], buildArea: BUILD_AREA }).filter((m) => m.questId === Q);
    expect(marks).toEqual([{ questId: Q, kind: 'objective', x: BUILD_AREA.x, z: BUILD_AREA.z }]);
    s = ok({ ...materials(s), time: 50 }, place).state;
    const loaded = fromSaveData(toSaveData(s, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.warnings).toEqual([]);
    expect(loaded.state.buildings[0]?.placedAt).toBe(50);
  });
});
