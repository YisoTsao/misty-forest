// 任務 7O：quest_dawn_001「找到回家的路」（Bible §5.4）——打開序章的寶箱（芽芽飛出來）時開始，走進晨曦村時自動完成、星光碎屑 × 3；
// 沒有發起人：任務日誌的可接取不列出、地圖標出村子。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { questStatus } from '@/game-core/quest/quest';
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
const Q = 'quest_dawn_001';
const quest = data.quests.get(Q)!;
const run = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
};

describe('quest_dawn_001 找到回家的路', () => {
  it('打開序章的寶箱：芽芽加入、任務開始', () => {
    const r = run(initialGameState(), { type: 'OpenChest', placementId: 'meadow_chest_001' });
    expect(r.events).toContainEqual({ type: 'CompanionUnlocked' });
    expect(r.events).toContainEqual({ type: 'QuestAccepted', quest: Q });
    expect(questStatus(r.state, quest)).toBe('active');
  });

  it('在草原走動不會完成；走進晨曦村時自動完成、拿到星光碎屑 × 3', () => {
    let s = run(initialGameState(), { type: 'OpenChest', placementId: 'meadow_chest_001' }).state;
    const shards = countItem(s.inventory, 'starlight_shard');
    s = run(s, { type: 'ExploreArea', x: 0, z: 10 }).state;
    expect(questStatus(s, quest)).toBe('active');
    const marks = questMarkers(s, data.quests, { npcPosition: () => null, placement: () => undefined, spawners: [] }).filter((m) => m.questId === Q);
    expect(marks).toEqual([{ questId: Q, kind: 'objective', x: -11, z: -34, radius: 16 }]);
    const r = run(s, { type: 'ExploreArea', x: -9, z: -30 });
    expect(r.events).toContainEqual({ type: 'QuestCompleted', quest: Q });
    expect(countItem(r.state.inventory, 'starlight_shard')).toBe(shards + 3);
  });

  it('還沒開寶箱時走進村子不會有事；任務完成後再進村子也不會重複', () => {
    const before = run(initialGameState(), { type: 'ExploreArea', x: -9, z: -30 });
    expect(before.events.some((e) => e.type === 'QuestProgressed')).toBe(false);
    let s = run(initialGameState(), { type: 'OpenChest', placementId: 'meadow_chest_001' }).state;
    s = run(s, { type: 'ExploreArea', x: -9, z: -30 }).state;
    const again = run(s, { type: 'ExploreArea', x: -12, z: -36 });
    expect(again.events.some((e) => e.type === 'QuestProgressed' || e.type === 'QuestCompleted')).toBe(false);
  });
});
