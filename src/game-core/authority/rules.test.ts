import { describe, expect, it } from 'vitest';
import { countItem, createInventory } from '../inventory/inventory';
import { testContext } from '../testing/fixtures';
import { canInteract } from '../world/objects';
import { clockAt, secondsUntilHour } from '../world/timeOfDay';
import { applyEvents, handleCommand, initialGameState, RESPAWN_CLEARANCE, type GameCommand, type GameState } from './rules';

const ctx = testContext();
const run = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  return { events, state: applyEvents(state, events, ctx) };
};
const rejectReason = (state: GameState, cmd: GameCommand) => {
  const [e] = handleCommand(state, cmd, ctx);
  return e?.type === 'CommandRejected' ? e.reason : null;
};

describe('HarvestObject', () => {
  it('採集樹木：標記已採集、記錄重生時間、木材進背包', () => {
    const start = { ...initialGameState(), time: 50 };
    const { events, state } = run(start, { type: 'HarvestObject', placementId: 't1' });
    expect(events).toEqual([
      { type: 'ObjectHarvested', placementId: 't1', respawnAt: 150 },
      { type: 'ItemsGained', items: [{ itemId: 'wood', count: 2 }], source: 't1' },
    ]);
    expect(state.objects.get('t1')).toMatchObject({ harvested: true, respawnAt: 150 });
    expect(countItem(state.inventory, 'wood')).toBe(2);
    expect(start.objects.size).toBe(0); // 不修改輸入
    expect(countItem(start.inventory, 'wood')).toBe(0);
  });

  it('已採集的物件不能重複採集', () => {
    const { state } = run(initialGameState(), { type: 'HarvestObject', placementId: 't1' });
    expect(rejectReason(state, { type: 'HarvestObject', placementId: 't1' })).toBe('already-harvested');
  });

  it('不存在、不可採集的物件被拒絕', () => {
    const s = initialGameState();
    expect(rejectReason(s, { type: 'HarvestObject', placementId: 'nope' })).toBe('unknown-object');
    expect(rejectReason(s, { type: 'HarvestObject', placementId: 'r1' })).toBe('wrong-interaction');
    expect(rejectReason(s, { type: 'HarvestObject', placementId: 'c1' })).toBe('wrong-interaction');
  });

  it('背包放不下時拒絕，物件維持未採集', () => {
    // 2 格背包、木材上限 10：塞滿 20 根後再砍
    let state: GameState = { ...initialGameState(), inventory: createInventory(2) };
    state = applyEvents(state, [{ type: 'ItemsGained', items: [{ itemId: 'wood', count: 20 }] }], ctx);
    const { events, state: after } = run(state, { type: 'HarvestObject', placementId: 't1' });
    expect(events).toEqual([{ type: 'CommandRejected', command: 'HarvestObject', placementId: 't1', reason: 'inventory-full' }]);
    expect(after.objects.has('t1')).toBe(false);
    expect(countItem(after.inventory, 'wood')).toBe(20);
  });
});

describe('OpenChest', () => {
  it('打開寶箱：狀態為 open、內容物進背包、星光夥伴解鎖', () => {
    const { events, state } = run(initialGameState(), { type: 'OpenChest', placementId: 'c1' });
    expect(events.map((e) => e.type)).toEqual(['ChestOpened', 'ItemsGained', 'CompanionUnlocked']);
    expect(state.companion.unlocked).toBe(true);
    expect(state.objects.get('c1')).toEqual({ placementId: 'c1', open: true });
    expect(countItem(state.inventory, 'shard')).toBe(1);
  });

  it('唯一獎勵不可重複領取', () => {
    const { state } = run(initialGameState(), { type: 'OpenChest', placementId: 'c1' });
    expect(rejectReason(state, { type: 'OpenChest', placementId: 'c1' })).toBe('already-open');
    expect(countItem(state.inventory, 'shard')).toBe(1);
  });

  it('沒有內容物的寶箱只改變開關狀態', () => {
    const { events } = run(initialGameState(), { type: 'OpenChest', placementId: 'c2' });
    expect(events).toEqual([{ type: 'ChestOpened', placementId: 'c2' }]);
  });

  it('背包滿時寶箱保持關閉，獎勵不會遺失', () => {
    let state: GameState = { ...initialGameState(), inventory: createInventory(1) };
    state = applyEvents(state, [{ type: 'ItemsGained', items: [{ itemId: 'wood', count: 1 }] }], ctx);
    expect(rejectReason(state, { type: 'OpenChest', placementId: 'c1' })).toBe('inventory-full');
    expect(run(state, { type: 'OpenChest', placementId: 'c1' }).state.objects.has('c1')).toBe(false);
  });

  it('不是寶箱的物件不能打開', () => {
    expect(rejectReason(initialGameState(), { type: 'OpenChest', placementId: 't1' })).toBe('wrong-interaction');
  });
});

describe('AdvanceTime 與重生', () => {
  const harvested = () => run(initialGameState(), { type: 'HarvestObject', placementId: 't1' }).state;

  it('時間前進；未到重生時間不重生', () => {
    const { events, state } = run(harvested(), { type: 'AdvanceTime', dt: 99 });
    expect(events[0]).toEqual({ type: 'TimeAdvanced', time: 99 });
    expect(events.some((e) => e.type === 'ObjectRespawned')).toBe(false);
    expect(state.time).toBe(99);
    expect(state.objects.get('t1')?.harvested).toBe(true);
  });

  it('到達重生時間後重生，回到預設狀態（從差異表移除）', () => {
    const { events, state } = run(harvested(), { type: 'AdvanceTime', dt: 100 });
    expect(events).toContainEqual({ type: 'ObjectRespawned', placementId: 't1' });
    expect(state.objects.has('t1')).toBe(false);
  });

  it('玩家站在重生位置附近時延後重生，離開後才重生', () => {
    const near = { x: 10 + RESPAWN_CLEARANCE * 0.5, z: 0 };
    const blocked = run(harvested(), { type: 'AdvanceTime', dt: 200, player: near });
    expect(blocked.state.objects.get('t1')?.harvested).toBe(true);
    const later = run(blocked.state, { type: 'AdvanceTime', dt: 1, player: { x: 50, z: 0 } });
    expect(later.state.objects.has('t1')).toBe(false);
  });

  it('沒有 respawnSec 的物件永遠不重生', () => {
    const { state } = run(initialGameState(), { type: 'HarvestObject', placementId: 'f1' });
    expect(state.objects.get('f1')).toMatchObject({ harvested: true, respawnAt: undefined });
    expect(run(state, { type: 'AdvanceTime', dt: 1e6 }).state.objects.get('f1')?.harvested).toBe(true);
  });

  it('拒絕非正數或非有限的時間', () => {
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rejectReason(initialGameState(), { type: 'AdvanceTime', dt })).toBe('invalid-command');
    }
  });

  it('只有時間事件時保留原本的 objects 參照（selector 不重新計算）', () => {
    const s = harvested();
    expect(run(s, { type: 'AdvanceTime', dt: 1 }).state.objects).toBe(s.objects);
  });
});

describe('canInteract', () => {
  it('寶箱打開後、可採集物採集後不再顯示提示；不可互動的物件永不顯示', () => {
    const prefab = (id: string) => ctx.world.prefab(id)!;
    expect(canInteract(prefab('chest'), undefined)).toBe(true);
    expect(canInteract(prefab('chest'), { placementId: 'c1', open: true })).toBe(false);
    expect(canInteract(prefab('tree'), undefined)).toBe(true);
    expect(canInteract(prefab('tree'), { placementId: 't1', harvested: true })).toBe(false);
    expect(canInteract(prefab('rock'), undefined)).toBe(false);
  });
});

describe('AdvanceTutorial', () => {
  it('依序前進：move → interact → harvest → inventory → done', () => {
    let state = initialGameState();
    expect(state.tutorial).toBe('move');
    for (const next of ['interact', 'harvest', 'inventory', 'done'] as const) {
      const r = run(state, { type: 'AdvanceTutorial', from: state.tutorial });
      expect(r.events).toEqual([{ type: 'TutorialAdvanced', step: next }]);
      state = r.state;
    }
    expect(state.tutorial).toBe('done');
  });

  it('from 與目前步驟不同（重複送出或跳步）時拒絕；完成後不再前進', () => {
    const s = initialGameState();
    expect(rejectReason(s, { type: 'AdvanceTutorial', from: 'harvest' })).toBe('tutorial-mismatch');
    const done = { ...s, tutorial: 'done' as const };
    expect(rejectReason(done, { type: 'AdvanceTutorial', from: 'done' })).toBe('tutorial-mismatch');
  });
});

describe('DebugSetMistStage', () => {
  it('允許除錯指令時改變區域迷霧；與目前相同時不產生事件', () => {
    const debugCtx = { ...ctx, allowDebugCommands: true };
    const s = initialGameState();
    expect(s.mist.forest).toBe('dense');
    const events = handleCommand(s, { type: 'DebugSetMistStage', region: 'forest', stage: 'clear' }, debugCtx);
    expect(events).toEqual([{ type: 'MistStageChanged', region: 'forest', stage: 'clear' }]);
    const next = applyEvents(s, events, debugCtx);
    expect(next.mist.forest).toBe('clear');
    expect(next.mist.village).toBe(s.mist.village);
    expect(s.mist.forest).toBe('dense'); // 不修改輸入
    expect(handleCommand(next, { type: 'DebugSetMistStage', region: 'forest', stage: 'clear' }, debugCtx)).toEqual([]);
  });

  it('不允許除錯指令時拒絕', () => {
    expect(rejectReason(initialGameState(), { type: 'DebugSetMistStage', region: 'forest', stage: 'clear' })).toBe('not-allowed');
    expect(rejectReason(initialGameState(), { type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 1 }] })).toBe('not-allowed');
  });

  it('DebugGiveItems 放入物品', () => {
    const debugCtx = { ...ctx, allowDebugCommands: true };
    const events = handleCommand(initialGameState(), { type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 3 }] }, debugCtx);
    expect(countItem(applyEvents(initialGameState(), events, debugCtx).inventory, 'wood')).toBe(3);
  });
});

describe('Sleep / DebugSetClock（日夜，GAME_DESIGN 5.2）', () => {
  it('睡到早上 7 點：時間只往前、體力回滿、經過的時間照常結算重生', () => {
    const night = { ...initialGameState(), time: secondsUntilHour(0, 22) };
    const hurt = { ...night, player: { ...night.player, hp: 30 } };
    const harvested = run(hurt, { type: 'HarvestObject', placementId: 't1' }).state;
    const { state } = run(harvested, { type: 'Sleep', untilHour: 7 });
    expect(clockAt(state.time)).toBeCloseTo(7, 5);
    expect(state.time).toBeGreaterThan(harvested.time);
    expect(state.player.hp).toBe(100);
    // 樹的重生時間（100 秒）在睡覺期間經過
    expect(state.objects.get('t1')?.harvested).toBeUndefined();
  });

  it('不合法的時刻與倒下時不能睡', () => {
    expect(rejectReason(initialGameState(), { type: 'Sleep', untilHour: 25 })).toBe('invalid-command');
    const down = { ...initialGameState(), player: { ...initialGameState().player, hp: 0, defeated: true } };
    expect(rejectReason(down, { type: 'Sleep', untilHour: 7 })).toBe('player-defeated');
  });

  it('除錯設定時鐘：只在允許除錯指令時接受，已在該時刻則沒有事件', () => {
    expect(rejectReason(initialGameState(), { type: 'DebugSetClock', hour: 21 })).toBe('not-allowed');
    const debugCtx = { ...ctx, allowDebugCommands: true };
    const events = handleCommand(initialGameState(), { type: 'DebugSetClock', hour: 21 }, debugCtx);
    expect(clockAt(applyEvents(initialGameState(), events, debugCtx).time)).toBeCloseTo(21, 5);
    expect(handleCommand(initialGameState(), { type: 'DebugSetClock', hour: 8 }, debugCtx)).toEqual([]);
  });
});
