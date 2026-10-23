// 支線 CH2-SQ-05 被遺忘的花園（規格 8.3）：舊木盒要星光照明才打得開，裡面是被遺忘的種子；帶回聚落換螢苔花種，家園解鎖螢苔苗圃（會成長）。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { isBuildableUnlocked } from '@/game-core/build/build';
import { countItem } from '@/game-core/inventory/inventory';
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

describe('被遺忘的花園', () => {
  it('沒有照明打不開舊木盒；照明後拿到種子，回報換花種並解鎖螢苔苗圃', () => {
    let s: GameState = { ...initialGameState(), quests: { quest_forest_004: { status: 'completed' } } };
    s = run(s, { type: 'AcceptQuest', quest: 'quest_forest_sq05' }).state;
    expect(run(s, { type: 'OpenChest', placementId: 'seed_cache_01' }).events[0]?.type).toBe('CommandRejected');
    s = run(s, { type: 'Lumen' }).state;
    s = run(s, { type: 'OpenChest', placementId: 'seed_cache_01' }).state;
    expect(countItem(s.inventory, 'forgotten_seed')).toBe(1);
    const plot = data.buildables.get('glow_plot')!;
    expect(isBuildableUnlocked(plot, s.quests)).toBe(false);
    s = run(s, { type: 'TurnInQuest', quest: 'quest_forest_sq05' }).state;
    expect(countItem(s.inventory, 'glow_seed')).toBe(3);
    expect(countItem(s.inventory, 'forgotten_seed')).toBe(0);
    expect(isBuildableUnlocked(plot, s.quests)).toBe(true);
    expect(plot.growth?.stages).toHaveLength(3);
  });
});
