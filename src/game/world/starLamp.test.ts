// 任務 12C：星光燈柱（規格 P-01、Bible §6.4）——未啟動、素材不足的提示、消耗一顆純淨螢苔、
// 點亮後所在區域的迷霧降一段、不能重複消耗、存讀檔後保持；純淨螢苔採集點。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { addItems, countItem } from '@/game-core/inventory/inventory';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { canInteract } from '@/game-core/world/objects';
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
const LAMP = 'glowmoss_star_lamp_01';
const NODE = 'glowmoss_pure_node_01';
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
const withPure = (s: GameState, n: number): GameState => ({ ...s, inventory: addItems(s.inventory, [{ itemId: 'pure_glowmoss', count: n }], data.items)! });
const activate = (s: GameState) => ok(s, { type: 'ActivateObject', placementId: LAMP });

describe('任務 12C 星光燈柱', () => {
  it('燈柱在 A 迷霧入口，一開始的迷霧是濃霧，未啟動時可以互動', () => {
    const p = index.placement(LAMP)!;
    expect(p.regionId).toBe('mist_gate');
    expect(initialGameState().mist.mist_gate).toBe('dense');
    expect(canInteract(index.prefab('star_lamp')!, undefined)).toBe(true);
  });

  it('沒有純淨螢苔時拒絕啟動，燈柱與迷霧都不變', () => {
    const s = initialGameState();
    expect(rejection(s, { type: 'ActivateObject', placementId: LAMP })).toBe('missing-materials');
    const after = handleCommand(s, { type: 'ActivateObject', placementId: LAMP }, ctx);
    expect(after.some((e) => e.type === 'ObjectActivated')).toBe(false);
  });

  it('有一顆純淨螢苔：消耗一顆、燈柱點亮、迷霧降一段、顯示訊息', () => {
    const r = ok(withPure(initialGameState(), 1), { type: 'ActivateObject', placementId: LAMP });
    expect(r.events).toContainEqual({ type: 'ItemsRemoved', items: [{ itemId: 'pure_glowmoss', count: 1 }], reason: 'quest' });
    expect(r.events).toContainEqual({ type: 'MistStageChanged', region: 'mist_gate', stage: 'light' });
    expect(r.state.objects.get(LAMP)?.active).toBe(true);
    expect(countItem(r.state.inventory, 'pure_glowmoss')).toBe(0);
    expect(r.state.mist.mist_gate).toBe('light');
    expect(canInteract(index.prefab('star_lamp')!, r.state.objects.get(LAMP))).toBe(false);
    expect(index.prefab('star_lamp')!.activate?.message?.bodyKey).toBe('lamp.lit.body');
  });

  it('點亮後不能再次啟動，也不會重複消耗', () => {
    const lit = activate(withPure(initialGameState(), 2)).state;
    expect(rejection(lit, { type: 'ActivateObject', placementId: LAMP })).toBe('already-active');
    expect(countItem(lit.inventory, 'pure_glowmoss')).toBe(1);
  });

  it('存讀檔後燈柱與迷霧保持點亮狀態', () => {
    const lit = activate(withPure(initialGameState(), 1)).state;
    const loaded = fromSaveData(toSaveData(lit, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.state.objects.get(LAMP)?.active).toBe(true);
    expect(loaded.state.mist.mist_gate).toBe('light');
    expect(rejection(loaded.state, { type: 'ActivateObject', placementId: LAMP })).toBe('already-active');
  });

  it('純淨螢苔採集點：採集得到純淨螢苔，會重生', () => {
    const r = ok(initialGameState(), { type: 'HarvestObject', placementId: NODE });
    expect(countItem(r.state.inventory, 'pure_glowmoss')).toBe(1);
    expect(r.state.objects.get(NODE)?.harvested).toBe(true);
    expect(index.prefab('glowmoss_node')!.harvest?.respawnSec).toBeGreaterThan(0);
  });
});
