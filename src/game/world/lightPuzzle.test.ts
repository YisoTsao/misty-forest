// 任務 9D：quest_lake_002「把水送回遠方」（Bible §7.4）——水鏡光路：每面水鏡只能轉 90 度、
// 光從曙光石經三面水鏡照到湖底閘門時閘門打開；只有任務進行中才能轉；回報奇奇得到水行護符。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { countItem } from '@/game-core/inventory/inventory';
import { isQuestReady } from '@/game-core/quest/quest';
import { mirrorYaw, traceLight } from '@/game-core/world/lightPath';
import { mapIdAt } from '@/game-core/world/maps';
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
  lightPaths: data.lightPaths,
  allowDebugCommands: true,
};
const Q = 'quest_lake_002';
const light = data.lightPaths[0]!;
const [M1, M2, M3] = light.mirrors as [string, string, string];
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
const npc = (id: string) => data.npcs.find((n) => n.id === id)!;
const talk = (s: GameState, id: string) => pickDialogue(npc(id).talk, s, { quests: data.quests });
const reflected = (): GameState => ({ ...initialGameState(), quests: { quest_forest_003: { status: 'completed' }, quest_lake_001: { status: 'completed' } } });
const turn = (s: GameState, id: string, times: number) => {
  for (let i = 0; i < times; i++) s = ok(s, { type: 'TurnObject', placementId: id }).state;
  return s;
};
const trace = (s: GameState) => traceLight(light, (id) => index.placement(id), s.objects);

describe('水鏡光路', () => {
  it('光路都在澄鏡湖；一開始光只照到第一面鏡子，沒有照到閘門', () => {
    for (const id of [...light.mirrors, light.target]) {
      const p = index.placement(id)!;
      expect(mapIdAt(p.position[0], p.position[2])).toBe('mirrorlake');
    }
    const t = trace(initialGameState());
    expect(t.lit).toEqual([M1]);
    expect(t.solved).toBe(false);
    // 沒對準的光也畫得出來（照向空處）
    expect(t.segments.at(-1)?.hit).toBeNull();
  });

  it('每轉一次鏡子朝向轉 90 度，轉 4 次回到原位', () => {
    const p = index.placement(M1)!;
    expect(mirrorYaw(p, 1) - mirrorYaw(p, 0)).toBeCloseTo(Math.PI / 2);
    let s = ok(reflected(), { type: 'AcceptQuest', quest: Q }).state;
    s = turn(s, M1, 4);
    expect(s.objects.get(M1)?.turn ?? 0).toBe(0);
  });

  it('沒接任務不能轉；接了以後依序對準三面鏡子，光照到閘門時閘門自動打開（只送一次）', () => {
    expect(rejection(reflected(), { type: 'TurnObject', placementId: M1 })).toBe('quest-unavailable');
    let s = ok(reflected(), { type: 'AcceptQuest', quest: Q }).state;
    // 找出每面鏡子要轉幾次：逐一試，直到光多照到下一站
    for (const [i, id] of [M1, M2, M3].entries()) {
      let k = 0;
      while (trace(s).lit.length < i + 2 && !trace(s).solved && k < 4) {
        const r = ok(s, { type: 'TurnObject', placementId: id });
        s = r.state;
        k++;
        if (trace(s).solved) expect(r.events).toContainEqual({ type: 'ObjectActivated', placementId: light.target, source: 'light' });
      }
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(4);
    }
    expect(trace(s).solved).toBe(true);
    expect(s.objects.get(light.target)?.active).toBe(true);
    expect(isQuestReady(s, data.quests.get(Q)!)).toBe(true);
    // 再轉鏡子：閘門維持打開，不會再送啟動事件
    const again = ok(s, { type: 'TurnObject', placementId: M3 });
    expect(again.events.some((e) => e.type === 'ObjectActivated')).toBe(false);
  });

  it('奇奇在湖面不肯忘記之後交付、回報得到水行護符；湖岸的迷霧變清', () => {
    expect(talk(reflected(), 'kiki')).toBe('kiki_lake_offer');
    let s = ok(reflected(), { type: 'AcceptQuest', quest: Q }).state;
    expect(talk(s, 'kiki')).toBe('kiki_lake_progress');
    expect(talk(s, 'eve')).toBe('eve_mirrors');
    s = { ...s, objects: new Map([[light.target, { placementId: light.target, active: true }]]) };
    expect(talk(s, 'kiki')).toBe('kiki_lake_turnin');
    s = ok(s, { type: 'TurnInQuest', quest: Q }).state;
    expect(countItem(s.inventory, 'water_charm')).toBe(1);
    expect(s.mist.lake_shore).toBe('clear');
    expect(talk(s, 'kiki')).toBe('kiki_after_lake');
  });
});
