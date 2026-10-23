// 支線 CH2-SQ-01 會發光的晚餐（規格 8.3）：交出螢苔 ×3、菌帽 ×2、溪魚 ×2 → 螢光燉菇湯 ×2，聚落工作台解鎖燉湯的配方；
// 溪魚從倒流溪谷的淺灘撈（採集點會重生）。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { unlockedRecipes } from '@/game-core/craft/craft';
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
const ok = (s: GameState, cmd: GameCommand) => {
  const events = handleCommand(s, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return applyEvents(s, events, ctx);
};

describe('會發光的晚餐', () => {
  it('在溪谷的淺灘撈到溪魚', () => {
    const s = ok(initialGameState(), { type: 'HarvestObject', placementId: 'creek_fish_spot_01' });
    expect(countItem(s.inventory, 'creek_fish')).toBe(1);
  });

  it('交出材料拿到燉湯，工作台解鎖燉湯的配方', () => {
    const recipes = (s: GameState) => unlockedRecipes(data.crafting, 'glow_workbench', s.quests).map((r) => r.id);
    let s: GameState = { ...initialGameState(), quests: { quest_forest_002: { status: 'completed' } } };
    expect(recipes(s)).not.toContain('recipe_glow_stew');
    s = ok(s, { type: 'AcceptQuest', quest: 'quest_forest_sq01' });
    s = ok(s, { type: 'DebugGiveItems', items: [{ itemId: 'glow_moss', count: 3 }, { itemId: 'fungus_cap', count: 2 }, { itemId: 'creek_fish', count: 2 }] });
    s = ok(s, { type: 'TurnInQuest', quest: 'quest_forest_sq01' });
    expect(countItem(s.inventory, 'glow_stew')).toBe(2);
    expect(countItem(s.inventory, 'creek_fish')).toBe(0);
    expect(recipes(s)).toContain('recipe_glow_stew');
  });
});
