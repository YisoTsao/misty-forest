// 第二章 Phase 2：倒流溪谷水輪（規格 P-02、PHASE0 §1）——三座水輪依石碑的答案轉到位，石障退開；
// 答案不是寫在場景裡；轉過頭再轉回來不會重複啟動；存讀檔後轉動位置保留。
// 2026-10-25：水輪要先有水——苔石推到壓力板上、水閘打開後才轉得動（規格 P-02「移動石塊或啟動附近機關」）。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { canInteract, pushPosition } from '@/game-core/world/objects';
import { puzzleSolved } from '@/game-core/world/puzzles';
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
  puzzles: data.puzzles,
  allowDebugCommands: true,
};
const ok = (state: GameState, cmd: GameCommand) => {
  const events = handleCommand(state, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(state, events, ctx), events };
};
const turn = (s: GameState, id: string, times: number) => {
  let st = s;
  let events: ReturnType<typeof ok>['events'] = [];
  for (let i = 0; i < times; i++) {
    const r = ok(st, { type: 'TurnObject', placementId: id });
    st = r.state;
    events = [...events, ...r.events];
  }
  return { state: st, events };
};
/** 苔石推到壓力板上、水閘已開 */
const watered = (): GameState => {
  let s = initialGameState();
  for (let i = 0; i < 2; i++) s = ok(s, { type: 'PushObject', placementId: 'creek_push_stone' }).state;
  return s;
};
const solvedAnswer = (): GameState => {
  let s = watered();
  s = turn(s, 'creek_wheel_01', 1).state;
  s = turn(s, 'creek_wheel_02', 3).state;
  return turn(s, 'creek_wheel_03', 2).state;
};

describe('倒流溪谷水輪', () => {
  it('水輪可以轉動（轉軸 4 個位置）；石障沒有開之前擋著路', () => {
    expect(index.prefab('waterwheel')?.turn?.positions).toBe(4);
    expect(canInteract(index.prefab('waterwheel')!, undefined)).toBe(true);
    expect(canInteract(index.prefab('creek_barrier')!, undefined)).toBe(false);
  });

  it('答案在石碑上（三座水輪：第一座 1 格、第二座 3 格、最後一座 2 格）', () => {
    const p = data.puzzles.find((x) => x.id === 'creek_wheels')!;
    expect(p.members).toEqual([
      { placement: 'creek_wheel_01', turn: 1 },
      { placement: 'creek_wheel_02', turn: 3 },
      { placement: 'creek_wheel_03', turn: 2 },
    ]);
    expect(p.opens).toEqual(['creek_barrier']);
    expect(index.placement('creek_tablet')?.regionId).toBe('reverse_creek');
  });

  it('只差一座時石障不開；全部對準的那一下才啟動石障（source puzzle）', () => {
    const almost = turn(turn(watered(), 'creek_wheel_01', 1).state, 'creek_wheel_02', 3).state;
    const last = turn(almost, 'creek_wheel_03', 2);
    expect(last.events.some((e) => e.type === 'ObjectActivated' && e.placementId === 'creek_barrier' && e.source === 'puzzle')).toBe(true);
    expect(last.state.objects.get('creek_barrier')?.active).toBe(true);
    expect(solvedAnswer()).toEqual(last.state);
    const notYet = turn(almost, 'creek_wheel_03', 1);
    expect(notYet.events.some((e) => e.type === 'ObjectActivated')).toBe(false);
  });

  it('轉過頭再轉回來不會重複啟動；石障已開後不能再被啟動', () => {
    const solved = solvedAnswer();
    const moved = turn(solved, 'creek_wheel_01', 1);
    expect(moved.events.some((e) => e.type === 'ObjectActivated')).toBe(false);
    expect(puzzleSolved(data.puzzles[0]!, (id) => moved.state.objects.get(id)?.turn ?? 0)).toBe(false);
    // 轉回去又對準：石障已經是開的，不再重複發出啟動
    const back = turn(moved.state, 'creek_wheel_01', 3);
    expect(back.events.filter((e) => e.type === 'ObjectActivated')).toEqual([]);
  });

  it('存讀檔後轉動位置與石障狀態保留', () => {
    const solved = solvedAnswer();
    const loaded = fromSaveData(toSaveData(solved, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.state.objects.get('creek_wheel_02')?.turn).toBe(3);
    expect(loaded.state.objects.get('creek_barrier')?.active).toBe(true);
  });

  it('水閘關著時水輪轉不動（not-powered）', () => {
    expect(handleCommand(initialGameState(), { type: 'TurnObject', placementId: 'creek_wheel_01' }, ctx)[0]).toMatchObject({ type: 'CommandRejected', reason: 'not-powered' });
  });
});

describe('倒流溪谷的苔石與水閘', () => {
  const stone = index.prefab('push_stone')!;
  const push = (s: GameState) => ok(s, { type: 'PushObject', placementId: 'creek_push_stone' });

  it('沿軌道一次前進一格；推到最後一格才壓住壓力板、打開水閘（只啟動一次）', () => {
    const one = push(initialGameState());
    expect(one.state.objects.get('creek_push_stone')?.turn).toBe(1);
    expect(one.events.some((e) => e.type === 'ObjectActivated')).toBe(false);
    const two = push(one.state);
    expect(two.events.filter((e) => e.type === 'ObjectActivated').map((e) => e.type === 'ObjectActivated' && e.placementId)).toEqual(['creek_plate', 'creek_sluice']);
    expect(two.state.objects.get('creek_sluice')?.active).toBe(true);
    // 推到底不能再推，也不再顯示互動
    expect(handleCommand(two.state, { type: 'PushObject', placementId: 'creek_push_stone' }, ctx)[0]).toMatchObject({ reason: 'already-active' });
    expect(canInteract(stone, two.state.objects.get('creek_push_stone'))).toBe(false);
  });

  it('最後一格就在壓力板上', () => {
    const placement = index.placement('creek_push_stone')!;
    const plate = index.placement('creek_plate')!;
    const end = pushPosition(stone, placement, stone.push!.track.length - 1);
    expect(Math.hypot(end.x - plate.position[0], end.z - plate.position[2])).toBeLessThan(0.5);
  });

  it('存讀檔後石塊的位置與水閘狀態保留', () => {
    const s = push(push(initialGameState()).state).state;
    const loaded = fromSaveData(toSaveData(s, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.state.objects.get('creek_push_stone')?.turn).toBe(2);
    expect(loaded.state.objects.get('creek_sluice')?.active).toBe(true);
  });
});
