// 任務 7J：製作（Bible §26.1–26.2）——資料規則、配方依任務解鎖、缺少的材料、製作結果與背包滿時不製作、琳娜的對話入口。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { missingInputs, parseCraftData, unlockedRecipes } from '@/game-core/craft/craft';
import { addItems, countItem, createInventory } from '@/game-core/inventory/inventory';
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
  crafting: data.crafting,
  allowDebugCommands: true,
};
const withItems = (items: { itemId: string; count: number }[], quests: GameState['quests'] = {}): GameState => ({ ...initialGameState(), quests, inventory: addItems(createInventory(), items, data.items)! });
const run = (s: GameState, cmd: GameCommand) => {
  const events = handleCommand(s, cmd, ctx);
  return { state: applyEvents(s, events, ctx), events };
};
const rejection = (s: GameState, cmd: GameCommand) => {
  const e = handleCommand(s, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
};

describe('製作', () => {
  it('資料：不能用任務物品；工作台與 NPC 必須存在', () => {
    const refs = { items: data.items, npcs: new Set(['linna']), quests: new Set<string>() };
    const station = { id: 't', nameKey: 'x', npc: 'linna' };
    expect(() => parseCraftData({ stations: [station], recipes: [{ id: 'r', station: 't', output: { itemId: 'herb_potion', count: 1 }, inputs: [{ itemId: 'dawn_resonance', count: 1 }] }] }, refs)).toThrow(/任務物品/);
    expect(() => parseCraftData({ stations: [{ ...station, npc: 'nobody' }], recipes: [{ id: 'r', station: 't', output: { itemId: 'herb', count: 1 }, inputs: [{ itemId: 'herb', count: 1 }] }] }, refs)).toThrow(/NPC/);
  });

  it('月露藥膏的配方在琳娜的任務完成後才會做（Bible：月露藥膏配方是任務獎勵）', () => {
    expect(unlockedRecipes(data.crafting, 'linna_herbtable', {}).map((r) => r.id)).toEqual(['recipe_small_heal']);
    expect(unlockedRecipes(data.crafting, 'linna_herbtable', { quest_forest_001: { status: 'completed' } }).map((r) => r.id)).toContain('recipe_moondew_balm');
    expect(rejection(withItems([{ itemId: 'moondew_herb', count: 5 }, { itemId: 'glow_moss', count: 5 }]), { type: 'Craft', recipe: 'recipe_moondew_balm' })).toBe('recipe-locked');
  });

  it('材料不足時列出缺少的數量、不能製作；足夠時扣材料、得到成品', () => {
    const recipe = data.crafting.recipes.find((r) => r.id === 'recipe_small_heal')!;
    const poor = withItems([{ itemId: 'moondew_herb', count: 1 }]);
    expect(missingInputs(poor.inventory, recipe)).toEqual([
      { itemId: 'moondew_herb', count: 1 },
      { itemId: 'herb', count: 1 },
    ]);
    expect(rejection(poor, { type: 'Craft', recipe: recipe.id })).toBe('missing-materials');
    const r = run(withItems([{ itemId: 'moondew_herb', count: 3 }, { itemId: 'herb', count: 1 }]), { type: 'Craft', recipe: recipe.id });
    expect(countItem(r.state.inventory, 'herb_potion')).toBe(1);
    expect(countItem(r.state.inventory, 'moondew_herb')).toBe(1);
    expect(countItem(r.state.inventory, 'herb')).toBe(0);
  });

  it('背包放不下成品時不製作', () => {
    const full = withItems([{ itemId: 'moondew_herb', count: 3 }, { itemId: 'herb', count: 2 }, ...Array.from({ length: 22 }, () => ({ itemId: 'moondew_salve', count: 20 }))]);
    expect(rejection(full, { type: 'Craft', recipe: 'recipe_small_heal' })).toBe('inventory-full');
  });

  it('琳娜完成任務後的對話有「借用草藥桌」', () => {
    const effects = ['linna_after_path', 'linna_after_water'].flatMap((id) => Object.values(data.dialogues.get(id)!.nodes).flatMap((n) => (n.options ?? []).flatMap((o) => o.effects ?? [])));
    expect(effects).toContainEqual({ type: 'openCraft', station: 'linna_herbtable' });
  });
});
