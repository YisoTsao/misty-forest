// 任務 12E：quest_forest_001「失去光芒的森林」（Bible §6.5、規格 8.2 CH2-MQ-01）——莉露在 A 區交付任務，
// 點亮第一座星光燈柱後回報，拿到星光羅盤；回報只能一次；存讀檔後保持。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { addItems, countItem } from '@/game-core/inventory/inventory';
import { questStatus } from '@/game-core/quest/quest';
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
const Q = 'quest_forest_001';
const LAMP = 'glowmoss_star_lamp_01';
const quest = data.quests.get(Q)!;
const ok = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(state, events, ctx), events };
};
const rejection = (state: GameState, cmd: GameCommand) => {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
};
const afterDawn = (): GameState => ({ ...initialGameState(), quests: { quest_dawn_003: { status: 'completed' } } });
const accepted = () => ok(afterDawn(), { type: 'AcceptQuest', quest: Q }).state;
const withPure = (s: GameState): GameState => ({ ...s, inventory: addItems(s.inventory, [{ itemId: 'pure_glowmoss', count: 1 }], data.items)! });

describe('quest_forest_001 失去光芒的森林', () => {
  it('莉露在迷霧入口；前置任務是 quest_dawn_003；燈柱是唯一的目標', () => {
    expect(data.npcs.find((n) => n.id === 'lilu')?.regionId).toBe('mist_gate');
    expect(quest.giver).toBe('lilu');
    expect(quest.requires).toEqual(['quest_dawn_003']);
    expect(quest.objectives).toEqual([{ type: 'activate', placementIds: [LAMP], descKey: 'quest.forest1.lamp' }]);
    expect(questStatus(initialGameState(), quest)).toBe('locked');
    expect(questStatus(afterDawn(), quest)).toBe('available');
  });

  it('接取後點亮燈柱 → 任務待回報；回報拿到星光羅盤並完成，之後不能再回報', () => {
    const s = accepted();
    expect(questStatus(s, quest)).toBe('active');
    const lit = ok(withPure(s), { type: 'ActivateObject', placementId: LAMP }).state;
    const turned = ok(lit, { type: 'TurnInQuest', quest: Q });
    expect(turned.events).toContainEqual({ type: 'QuestCompleted', quest: Q });
    expect(countItem(turned.state.inventory, 'star_compass')).toBe(1);
    expect(questStatus(turned.state, quest)).toBe('completed');
    expect(rejection(turned.state, { type: 'TurnInQuest', quest: Q })).toBe('quest-unavailable');
  });

  it('燈柱還沒亮時不能回報', () => {
    expect(rejection(accepted(), { type: 'TurnInQuest', quest: Q })).toBe('quest-incomplete');
  });

  it('存讀檔後任務進度與星光羅盤保持', () => {
    const turned = ok(ok(withPure(accepted()), { type: 'ActivateObject', placementId: LAMP }).state, { type: 'TurnInQuest', quest: Q }).state;
    const loaded = fromSaveData(toSaveData(turned, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(questStatus(loaded.state, quest)).toBe('completed');
    expect(countItem(loaded.state.inventory, 'star_compass')).toBe(1);
  });
});
