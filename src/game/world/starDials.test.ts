// 支線 CH2-SQ-04 不會說謊的石碑（規格 8.3）：三塊星盤只有任務進行中能轉；轉到石碑說的方向（西、下、東 = 3、2、1 格）時任務可以回報。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady } from '@/game-core/quest/quest';
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
const run = (s: GameState, cmd: GameCommand) => {
  const events = handleCommand(s, cmd, ctx);
  return { state: applyEvents(s, events, ctx), events };
};
const turn = (s: GameState, id: string, n: number) => {
  for (let i = 0; i < n; i++) s = run(s, { type: 'TurnObject', placementId: id }).state;
  return s;
};
const quest = data.quests.get('quest_forest_sq04')!;

describe('不會說謊的石碑', () => {
  it('答案是西、下、東（3、2、1 格）', () => {
    const o = quest.objectives[0]!;
    expect(o.type === 'puzzle' && o.members.map((m) => m.turn)).toEqual([3, 2, 1]);
  });

  it('沒接任務時星盤轉不動；接了之後轉到答案就能回報，拿到古代星圖', () => {
    const base: GameState = { ...initialGameState(), quests: { quest_forest_004: { status: 'completed' } } };
    expect(run(base, { type: 'TurnObject', placementId: 'star_dial_01' }).events[0]?.type).toBe('CommandRejected');
    let s = run(base, { type: 'AcceptQuest', quest: 'quest_forest_sq04' }).state;
    s = turn(turn(s, 'star_dial_01', 3), 'star_dial_02', 2);
    expect(isQuestReady(s, quest)).toBe(false);
    s = turn(s, 'star_dial_03', 1);
    expect(isQuestReady(s, quest)).toBe(true);
    s = run(s, { type: 'TurnInQuest', quest: 'quest_forest_sq04' }).state;
    expect(countItem(s.inventory, 'star_chart')).toBe(1);
  });
});
