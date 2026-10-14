// 任務 7L：quest_dawn_006「河邊的腳印」（Bible §22.1）——沒有發起人：調查腳印自動開始（燈塔任務完成後）、
// 野果叢可摘且會重生、依序放下野果（交出 2 顆）、等一段時間才能觀察、觀察後自動完成並取得軟足印吊飾、角兔幼崽出現。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { evaluateCondition } from '@/game-core/dialogue/conditions';
import { addItems, countItem } from '@/game-core/inventory/inventory';
import { questMarkers } from '@/game-core/map/markers';
import { questStatus } from '@/game-core/quest/quest';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { canInteract } from '@/game-core/world/objects';
import { regionAt } from '@/game-core/world/regions';
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
const Q = 'quest_dawn_006';
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
const lit = (): GameState => ({ ...initialGameState(), time: 100, quests: { quest_dawn_003: { status: 'completed' } } });
const started = () => ok(lit(), { type: 'ActivateObject', placementId: 'river_footprints_01' }).state;
const withBerries = (s: GameState, n: number) => ({ ...s, inventory: addItems(s.inventory, [{ itemId: 'wild_berry', count: n }], data.items)! });

describe('quest_dawn_006 河邊的腳印', () => {
  it('沒有發起人；物件都在碎光溪邊', () => {
    expect(quest.giver).toBeUndefined();
    for (const id of ['river_footprints_01', 'river_nest_01', 'river_bunny_hide_01']) {
      const p = index.placement(id)!;
      expect(regionAt(data.regions, p.position[0], p.position[2]), id).toBe('river');
    }
  });

  it('燈塔任務完成前調查腳印不會開始；完成後調查就開始任務', () => {
    expect(rejection(initialGameState(), { type: 'ActivateObject', placementId: 'river_footprints_01' })).toBe('quest-unavailable');
    const r = ok(lit(), { type: 'ActivateObject', placementId: 'river_footprints_01' });
    expect(r.events).toContainEqual({ type: 'QuestAccepted', quest: Q });
    expect(questStatus(r.state, quest)).toBe('active');
    // 世界地圖：沒有發起人時沒有「!」「?」標記
    const marks = questMarkers(r.state, data.quests, { npcPosition: () => ({ x: 0, z: 0 }), placement: (id) => index.placement(id), spawners: [] }).filter((m) => m.questId === Q);
    expect(marks.every((m) => m.kind === 'objective')).toBe(true);
  });

  it('野果叢摘得到、會重生', () => {
    const r = ok(initialGameState(), { type: 'HarvestObject', placementId: 'river_berry_bush_01' });
    expect(countItem(r.state.inventory, 'wild_berry')).toBe(1);
    expect(r.state.objects.get('river_berry_bush_01')?.respawnAt).toBeGreaterThan(0);
  });

  it('野果不夠時放不下；放下會交出 2 顆並記錄時間；馬上觀察太早', () => {
    let s = started();
    expect(rejection(s, { type: 'ActivateObject', placementId: 'river_nest_01' })).toBe('missing-materials');
    expect(rejection(withBerries(s, 1), { type: 'ActivateObject', placementId: 'river_nest_01' })).toBe('missing-materials');
    s = withBerries(s, 2);
    s = ok(s, { type: 'ActivateObject', placementId: 'river_nest_01' }).state;
    expect(countItem(s.inventory, 'wild_berry')).toBe(0);
    expect(s.objects.get('river_nest_01')?.activatedAt).toBe(100);
    expect(rejection(s, { type: 'ActivateObject', placementId: 'river_bunny_hide_01' })).toBe('too-soon');
  });

  it('過一陣子回來觀察：任務自動完成、拿到軟足印吊飾、角兔幼崽出現；存讀檔保留', () => {
    let s = ok(withBerries(started(), 2), { type: 'ActivateObject', placementId: 'river_nest_01' }).state;
    // 野果放下後身上沒有野果了，觀察仍然可以進行（之前的版本把「收集野果」當成目標，交出後就卡住）
    s = ok(s, { type: 'AdvanceTime', dt: 100 }).state;
    expect(countItem(s.inventory, 'wild_berry')).toBe(0);
    expect(canInteract(index.prefab('bunny_hide')!, undefined, (q) => q === Q)).toBe(true);
    const r = ok(s, { type: 'ActivateObject', placementId: 'river_bunny_hide_01' });
    expect(r.events).toContainEqual({ type: 'QuestCompleted', quest: Q });
    s = r.state;
    expect(countItem(s.inventory, 'soft_footprint_charm')).toBe(1);
    const bunny = data.npcs.find((n) => n.id === 'horn_bunny')!;
    expect(evaluateCondition(bunny.visible, s, { quests: data.quests })).toBe(true);
    const loaded = fromSaveData(toSaveData(s, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.state.quests[Q]).toEqual({ status: 'completed' });
    expect(loaded.state.objects.get('river_nest_01')?.activatedAt).toBe(100);
  });
});
