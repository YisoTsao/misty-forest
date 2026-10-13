import { describe, expect, it } from 'vitest';
import questsData from '@/data/quests.json';
import itemsData from '@/data/items.json';
import npcsData from '@/data/npcs.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { evaluateCondition } from '../dialogue/conditions';
import { countItem, createInventory } from '../inventory/inventory';
import { testContext } from '../testing/fixtures';
import { isQuestReady, objectiveProgress, parseQuests, questStatus } from './quest';

const ctx = testContext();
const q = (id: string) => ctx.quests.get(id)!;
const run = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  return { events, state: applyEvents(state, events, ctx) };
};
const withWood = (state: GameState, count: number) => applyEvents(state, [{ type: 'ItemsGained', items: [{ itemId: 'wood', count }] }], ctx);
const reason = (state: GameState, cmd: GameCommand) => {
  const [e] = handleCommand(state, cmd, ctx);
  return e?.type === 'CommandRejected' ? e.reason : null;
};

describe('quests', () => {
  it('專案的任務資料合法', () => {
    const quests = parseQuests(questsData, { items: new Set(itemsData.map((i) => i.id)), npcs: new Set(npcsData.map((n) => n.id)) });
    expect(quests.size).toBeGreaterThanOrEqual(1);
  });

  it('狀態：沒有前置任務 → 可接；前置未完成 → 鎖定', () => {
    const s = initialGameState();
    expect(questStatus(s, q('gather'))).toBe('available');
    expect(questStatus(s, q('clear'))).toBe('locked');
  });

  it('接取任務：可接時成功，重複接取或鎖定時拒絕', () => {
    const { events, state } = run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' });
    expect(events).toEqual([{ type: 'QuestAccepted', quest: 'gather' }]);
    expect(questStatus(state, q('gather'))).toBe('active');
    expect(reason(state, { type: 'AcceptQuest', quest: 'gather' })).toBe('quest-unavailable');
    expect(reason(state, { type: 'AcceptQuest', quest: 'clear' })).toBe('quest-unavailable');
    expect(reason(state, { type: 'AcceptQuest', quest: 'nope' })).toBe('unknown-quest');
  });

  it('收集進度依背包數量計算，上限為目標數', () => {
    let s = run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' }).state;
    expect(objectiveProgress(s, q('gather'))).toEqual([{ current: 0, target: 4 }]);
    s = withWood(s, 3);
    expect(isQuestReady(s, q('gather'))).toBe(false);
    s = withWood(s, 5);
    expect(objectiveProgress(s, q('gather'))).toEqual([{ current: 4, target: 4 }]);
    expect(isQuestReady(s, q('gather'))).toBe(true);
  });

  it('回報：交出物品、完成、給獎勵；之後的任務解鎖', () => {
    let s = withWood(run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' }).state, 6);
    const r = run(s, { type: 'TurnInQuest', quest: 'gather' });
    expect(r.events.map((e) => e.type)).toEqual(['ItemsRemoved', 'QuestCompleted', 'ItemsGained']);
    s = r.state;
    expect(countItem(s.inventory, 'wood')).toBe(2);
    expect(countItem(s.inventory, 'shard')).toBe(1);
    expect(questStatus(s, q('gather'))).toBe('completed');
    expect(questStatus(s, q('clear'))).toBe('available');
    expect(reason(s, { type: 'TurnInQuest', quest: 'gather' })).toBe('quest-unavailable'); // 不能重複領獎
  });

  it('目標未達成時不能回報，物品不會被拿走', () => {
    const s = withWood(run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' }).state, 2);
    expect(reason(s, { type: 'TurnInQuest', quest: 'gather' })).toBe('quest-incomplete');
    expect(reason(initialGameState(), { type: 'TurnInQuest', quest: 'gather' })).toBe('quest-unavailable');
  });

  it('背包放不下獎勵時任務維持進行中', () => {
    // 1 格背包塞滿木材：交出 4 根後仍有木材，放不下星光碎片
    let s: GameState = { ...initialGameState(), inventory: createInventory(1) };
    s = withWood(run(s, { type: 'AcceptQuest', quest: 'gather' }).state, 10);
    expect(reason(s, { type: 'TurnInQuest', quest: 'gather' })).toBe('inventory-full');
    expect(countItem(s.inventory, 'wood')).toBe(10);
  });

  it('獎勵可以改變區域迷霧；不交出物品的目標不會扣物品', () => {
    let s = withWood(run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' }).state, 4);
    s = run(s, { type: 'TurnInQuest', quest: 'gather' }).state;
    s = run(s, { type: 'AcceptQuest', quest: 'clear' }).state;
    s = applyEvents(s, [{ type: 'ItemsGained', items: [{ itemId: 'flower', count: 1 }] }], ctx);
    const r = run(s, { type: 'TurnInQuest', quest: 'clear' });
    expect(r.events).toContainEqual({ type: 'MistStageChanged', region: 'forest', stage: 'clear' });
    expect(r.state.mist.forest).toBe('clear');
    expect(countItem(r.state.inventory, 'flower')).toBe(1);
  });

  it('對話條件：questStatus / questReady', () => {
    const cctx = { quests: ctx.quests };
    let s = run(initialGameState(), { type: 'AcceptQuest', quest: 'gather' }).state;
    expect(evaluateCondition({ type: 'questStatus', quest: 'gather', is: 'active' }, s, cctx)).toBe(true);
    expect(evaluateCondition({ type: 'questReady', quest: 'gather' }, s, cctx)).toBe(false);
    s = withWood(s, 4);
    expect(evaluateCondition({ type: 'questReady', quest: 'gather' }, s, cctx)).toBe(true);
    expect(evaluateCondition({ type: 'questStatus', quest: 'clear', is: 'locked' }, s, cctx)).toBe(true);
  });

  it('拒絕前置任務不存在的資料', () => {
    const bad = [{ ...questsData[0], requires: ['ghost'] }];
    expect(() => parseQuests(bad, { items: new Set(itemsData.map((i) => i.id)), npcs: new Set(npcsData.map((n) => n.id)) })).toThrow(/ghost/);
  });
});
