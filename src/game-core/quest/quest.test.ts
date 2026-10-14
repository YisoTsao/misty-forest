import { describe, expect, it } from 'vitest';
import questsData from '@/data/quests.json';
import itemsData from '@/data/items.json';
import npcsData from '@/data/npcs.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState } from '../authority/rules';
import { evaluateCondition } from '../dialogue/conditions';
import { countItem, createInventory } from '../inventory/inventory';
import { testContext } from '../testing/fixtures';
import { isQuestReady, isQuestTracked, objectiveProgress, parseQuests, questStatus, trackedSideCount } from './quest';

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

describe('RepairObject 與修復目標', () => {
  const accept = () => run(initialGameState(), { type: 'AcceptQuest', quest: 'mend' }).state;

  it('任務未進行時不能修（規格：修復任務中才可互動）', () => {
    expect(reason(withWood(initialGameState(), 5), { type: 'RepairObject', placementId: 'b1' })).toBe('quest-unavailable');
  });

  it('材料不足時拒絕，物品不變', () => {
    const s = withWood(accept(), 2);
    expect(reason(s, { type: 'RepairObject', placementId: 'b1' })).toBe('missing-materials');
    expect(countItem(s.inventory, 'wood')).toBe(2);
  });

  it('修好：消耗材料、狀態為已修復、任務目標達成；不能重複修', () => {
    const s0 = withWood(accept(), 5);
    expect(objectiveProgress(s0, q('mend'))).toEqual([{ current: 0, target: 1 }]);
    const r = run(s0, { type: 'RepairObject', placementId: 'b1' });
    expect(r.events).toEqual([
      { type: 'ItemsRemoved', items: [{ itemId: 'wood', count: 3 }], reason: 'repair' },
      { type: 'ObjectRepaired', placementId: 'b1' },
    ]);
    expect(r.state.objects.get('b1')?.repaired).toBe(true);
    expect(countItem(r.state.inventory, 'wood')).toBe(2);
    expect(isQuestReady(r.state, q('mend'))).toBe(true);
    expect(reason(r.state, { type: 'RepairObject', placementId: 'b1' })).toBe('already-repaired');
    // 回報後湖的迷霧清除
    const done = run(r.state, { type: 'TurnInQuest', quest: 'mend' }).state;
    expect(done.mist.lake).toBe('clear');
  });

  it('不是可修復的物件不能修', () => {
    expect(reason(accept(), { type: 'RepairObject', placementId: 't1' })).toBe('wrong-interaction');
  });
});

describe('任務日誌的追蹤（任務 7F）', () => {
  const apply = (s: GameState, cmd: GameCommand) => {
    const events = handleCommand(s, cmd, ctx);
    return { state: applyEvents(s, events, ctx), events };
  };

  it('接取的支線預設追蹤；取消後再追蹤；沒有接的任務不能追蹤', () => {
    let s = apply(initialGameState(), { type: 'AcceptQuest', quest: 'mend' }).state;
    const mend = ctx.quests.get('mend')!;
    expect(isQuestTracked(s.quests.mend, mend)).toBe(true);
    const r = apply(s, { type: 'TrackQuest', quest: 'mend', tracked: false });
    expect(r.events).toEqual([{ type: 'QuestTracked', quest: 'mend', tracked: false }]);
    s = r.state;
    expect(s.quests.mend).toEqual({ status: 'active', untracked: true });
    expect(isQuestTracked(s.quests.mend, mend)).toBe(false);
    // 重複送出沒有事件
    expect(apply(s, { type: 'TrackQuest', quest: 'mend', tracked: false }).events).toEqual([]);
    s = apply(s, { type: 'TrackQuest', quest: 'mend', tracked: true }).state;
    expect(s.quests.mend).toEqual({ status: 'active' });
    expect(apply(s, { type: 'TrackQuest', quest: 'gather', tracked: true }).events[0]).toMatchObject({ type: 'CommandRejected', reason: 'quest-unavailable' });
  });

  it('最多追蹤三個；已經滿了時新接的任務先不追蹤', () => {
    let s = initialGameState();
    for (const q of ['gather', 'mend', 'hunt']) s = apply(s, { type: 'AcceptQuest', quest: q }).state;
    expect(trackedSideCount(s.quests, ctx.quests)).toBe(3);
    s = { ...s, quests: { ...s.quests, clear: { status: 'active', untracked: true } } };
    expect(apply(s, { type: 'TrackQuest', quest: 'clear', tracked: true }).events[0]).toMatchObject({ type: 'CommandRejected', reason: 'track-limit' });
    // 已經追蹤三個時接新任務：附帶一個不追蹤的事件（gather 改成完成讓 clear 可以接，另外兩個仍在追蹤，再取消一個 → 不滿）
    const done = { ...s, quests: { mend: s.quests.mend!, hunt: s.quests.hunt!, gather: { status: 'completed' as const } } };
    expect(apply(done, { type: 'AcceptQuest', quest: 'clear' }).events).toEqual([{ type: 'QuestAccepted', quest: 'clear' }]);
  });

  it('已經追蹤三個時，新接的支線先不追蹤', () => {
    const extra = { ...ctx.quests.get('mend')!, id: 'extra' };
    const ctx2 = { ...ctx, quests: new Map([...ctx.quests, ['extra', extra]]) };
    let s = initialGameState();
    for (const q of ['gather', 'mend', 'hunt']) s = applyEvents(s, handleCommand(s, { type: 'AcceptQuest', quest: q }, ctx2), ctx2);
    expect(handleCommand(s, { type: 'AcceptQuest', quest: 'extra' }, ctx2)).toEqual([
      { type: 'QuestAccepted', quest: 'extra' },
      { type: 'QuestTracked', quest: 'extra', tracked: false },
    ]);
  });
});
