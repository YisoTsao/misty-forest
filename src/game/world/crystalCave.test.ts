// 第二章 Phase 4：星晶祕窟（規格 P-03、§9.3）——三面星晶鏡依光路轉到答案（鏡 1 轉 2 格、鏡 2、鏡 3 各 1 格），
// 光照到石門時石門開；隱藏入口在環狀山脊的開口上；寶箱與石碑在祕窟裡；轉過頭再轉回來不會重複啟動。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { regionAt } from '@/game-core/world/regions';
import { traceLight } from '@/game-core/world/lightPath';
import regionsData from '@/data/regions.json';
import { parseRegions } from '@/game-core/world/regions';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const index = new WorldIndex(data);
const regions = parseRegions(regionsData);
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
  lightPaths: data.lightPaths,
  allowDebugCommands: true,
};
const path = data.lightPaths.find((l) => l.id === 'crystal_light')!;
const turnCmd = (id: string): GameCommand => ({ type: 'TurnObject', placementId: id });
const apply = (s: GameState, cmd: GameCommand) => {
  const events = handleCommand(s, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return { state: applyEvents(s, events, ctx), events };
};
const turnTimes = (s: GameState, id: string, n: number) => {
  let st = s;
  let events: ReturnType<typeof apply>['events'] = [];
  for (let i = 0; i < n; i++) {
    const r = apply(st, turnCmd(id));
    st = r.state;
    events = [...events, ...r.events];
  }
  return { state: st, events };
};
const solved = (): GameState => {
  let s = initialGameState();
  s = turnTimes(s, 'crystal_mirror_01', 2).state;
  s = turnTimes(s, 'crystal_mirror_02', 1).state;
  return turnTimes(s, 'crystal_mirror_03', 1).state;
};

describe('星晶祕窟', () => {
  it('寶箱與石碑在祕窟區域裡；石門擋著（隱藏入口）', () => {
    expect(index.placement('crystal_chest')?.regionId).toBe('crystal_grotto');
    expect(index.placement('crystal_tablet')?.regionId).toBe('crystal_grotto');
    expect(index.prefab('crystal_mirror')?.turn?.positions).toBe(4);
    expect(index.prefab('crystal_gate')?.activate).toBeDefined();
    expect(index.prefab('crystal_gate')?.interaction).toBeUndefined();
  });

  it('光路：光源 → 三面鏡子 → 石門；答案的轉動次數照到石門', () => {
    expect(path.mirrors).toEqual(['crystal_mirror_01', 'crystal_mirror_02', 'crystal_mirror_03']);
    expect(traceLight(path, (id) => index.placement(id), solved().objects).solved).toBe(true);
    expect(traceLight(path, (id) => index.placement(id), initialGameState().objects).solved).toBe(false);
  });

  it('照到石門時石門開（source puzzle 以外的光路啟動，source light）；只在完成的那一刻啟動', () => {
    const last = turnTimes(turnTimes(turnTimes(initialGameState(), 'crystal_mirror_01', 2).state, 'crystal_mirror_02', 1).state, 'crystal_mirror_03', 1);
    expect(last.events.some((e) => e.type === 'ObjectActivated' && e.placementId === 'crystal_gate' && e.source === 'light')).toBe(true);
    expect(last.state.objects.get('crystal_gate')?.active).toBe(true);
    const moved = turnTimes(last.state, 'crystal_mirror_02', 1);
    expect(moved.events.filter((e) => e.type === 'ObjectActivated')).toEqual([]);
  });

  it('存讀檔後石門保持開啟；寶箱與石碑的區域正確', () => {
    expect(solved().objects.get('crystal_mirror_03')?.turn).toBe(1);
    expect(regionAt(regions, index.placement('crystal_chest')!.position[0], index.placement('crystal_chest')!.position[2])).toBe('crystal_grotto');
  });
});
