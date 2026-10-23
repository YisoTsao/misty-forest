// 第二章 Phase 2：裝備系統（PHASE0 §4、規格 §7.3）——裝備與卸下、武器變體的職業限制與生效條件、
// 守林者護腕減傷與稀有掉落加成、水行護符（被動效果）、聚落工作台製作裝備、存檔欄位。
import { describe, expect, it } from 'vitest';
import classesRaw from '@/data/classes.json';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { parseHeroClasses } from '@/game-core/character/heroClass';
import { rollLoot } from '@/game-core/items/items';
import { addItems, countItem } from '@/game-core/inventory/inventory';
import { currentModifiersFor } from '@/game-core/equipment/testing';
import { fromSaveData, toSaveData } from '@/game-core/save/convert';
import { SAVE_VERSION } from '@/game-core/save/schema';
import { characterIds } from '../../game/character/characters';
import { worldDataResult } from '../worldData';
import { WorldIndex } from './worldIndex';

if (!worldDataResult.ok) throw new Error(worldDataResult.error);
const data = worldDataResult.data;
const heroClasses = parseHeroClasses(classesRaw, { weapons: data.weapons, spells: data.spells, characters: new Set(characterIds()) });
const ctx: RulesContext = {
  world: new WorldIndex(data),
  items: data.items,
  lootTables: data.lootTables,
  random: () => 0.5,
  quests: data.quests,
  combat: data.combat,
  weapons: data.weapons,
  spells: data.spells,
  heroClasses,
  buildables: data.buildables,
  crafting: data.crafting,
  allowDebugCommands: true,
};
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
const give = (s: GameState, itemId: string, count = 1): GameState => ({ ...s, inventory: addItems(s.inventory, [{ itemId, count }], data.items)! });
/** 旅人（短刀可用）的起始狀態 */
const traveler = (): GameState => ({ ...initialGameState(), player: { ...initialGameState().player, heroClass: 'traveler', weapon: 'knife' } });
const mods = (s: GameState) => currentModifiersFor(s, ctx);

describe('裝備與卸下', () => {
  it('裝備時道具從背包移到裝備格；卸下後放回背包', () => {
    const s = give(traveler(), 'forest_bracer');
    const worn = ok(s, { type: 'EquipItem', itemId: 'forest_bracer' }).state;
    expect(countItem(worn.inventory, 'forest_bracer')).toBe(0);
    expect(worn.equipment).toEqual({ armor: 'forest_bracer' });
    const back = ok(worn, { type: 'UnequipItem', slot: 'armor' }).state;
    expect(countItem(back.inventory, 'forest_bracer')).toBe(1);
    expect(back.equipment).toEqual({});
  });

  it('沒有這件道具、不是裝備、或職業不能用的武器變體都不能裝備', () => {
    expect(rejection(traveler(), { type: 'EquipItem', itemId: 'forest_bracer' })).toBe('invalid-command');
    expect(rejection(give(traveler(), 'water_charm'), { type: 'EquipItem', itemId: 'water_charm' })).toBe('invalid-command');
    // 螢苔法杖的基礎武器是法杖，旅人不能用
    expect(rejection(give(traveler(), 'glow_staff'), { type: 'EquipItem', itemId: 'glow_staff' })).toBe('invalid-command');
  });

  it('同一格換裝：原本的裝備放回背包', () => {
    const s = give(give(traveler(), 'forest_bracer'), 'forest_bracer');
    const first = ok(s, { type: 'EquipItem', itemId: 'forest_bracer' }).state;
    expect(countItem(first.inventory, 'forest_bracer')).toBe(1);
    const r = ok(first, { type: 'EquipItem', itemId: 'forest_bracer' });
    expect(r.events).toContainEqual({ type: 'ItemUnequipped', slot: 'armor', itemId: 'forest_bracer' });
    expect(countItem(r.state.inventory, 'forest_bracer')).toBe(1);
  });
});

describe('效果', () => {
  it('武器變體只在基礎武器是目前的武器時加成攻擊', () => {
    const s = ok(give(traveler(), 'glow_knife'), { type: 'EquipItem', itemId: 'glow_knife' }).state;
    expect(mods(s).attackScale).toBe(1.25);
    expect(mods({ ...s, player: { ...s.player, weapon: 'sword' } }).attackScale).toBe(1);
  });

  it('守林者護腕：受到的傷害 ×0.9、稀有掉落加成 15%、迷霧傷害 ×0.5', () => {
    const m = mods(ok(give(traveler(), 'forest_bracer'), { type: 'EquipItem', itemId: 'forest_bracer' }).state);
    expect(m.damageTakenScale).toBe(0.9);
    expect(m.rareDropBonus).toBeCloseTo(0.15);
    expect(m.mistDamageScale).toBe(0.5);
  });

  it('水行護符持有即生效（被動效果），不必裝備', () => {
    expect(mods(give(traveler(), 'water_charm')).waterBreath).toBe(true);
    expect(mods(traveler()).waterBreath).toBe(false);
  });

  it('稀有掉落加成只影響標為 rare 的項目（機率乘上加成）', () => {
    const table = { id: 't', drops: [{ itemId: 'herb', min: 1, max: 1, chance: 0.5, rare: true }, { itemId: 'wood', min: 1, max: 1, chance: 0.5 }] };
    const roll = (bonus: number, r: number) => rollLoot(table, () => r, bonus).map((s) => s.itemId);
    // 隨機值 0.6：沒有加成時稀有項目掉不出來；加 30% 後機率 0.65，掉得出來
    expect(roll(0, 0.6)).toEqual([]);
    expect(roll(0.3, 0.6)).toEqual(['herb']);
    // 一般項目不受影響：隨機值低於機率就一樣掉（加成與否結果相同）
    expect(roll(0, 0.45)).toEqual(roll(0.3, 0.45));
  });
});

describe('工作台與存檔', () => {
  it('聚落工作台能製作螢晶短劍（材料不足不製作）', () => {
    const recipe = 'recipe_glow_knife';
    expect(rejection(traveler(), { type: 'Craft', recipe })).toBe('missing-materials');
    let s = give(traveler(), 'mist_fang', 3);
    s = give(s, 'star_crystal', 1);
    s = give(s, 'tough_bark', 2);
    const made = ok(s, { type: 'Craft', recipe });
    expect(countItem(made.state.inventory, 'glow_knife')).toBe(1);
    expect(countItem(made.state.inventory, 'mist_fang')).toBe(0);
  });

  it('存檔保存裝備格，v20 版本', () => {
    expect(SAVE_VERSION).toBe(20);
    const worn = ok(give(traveler(), 'forest_bracer'), { type: 'EquipItem', itemId: 'forest_bracer' }).state;
    const loaded = fromSaveData(toSaveData(worn, { position: { x: 0, y: 0, z: 0 }, facingYaw: 0 }, new Date()), ctx);
    expect(loaded.state.equipment).toEqual({ armor: 'forest_bracer' });
  });
});

describe('迷霧持續傷害（第二章 Phase 3）', () => {
  const deep = (s: GameState): GameState => ({ ...s, mist: { ...s.mist, deep_mist: 'dense' } });
  const harmCtx = { ...ctx, regionHarm: new Set(['deep_mist' as const]) };
  const harm = (s: GameState, region: 'deep_mist' | 'mist_gate') => applyEvents(s, handleCommand(s, { type: 'MistHarm', region }, harmCtx), harmCtx);

  it('濃霧且會扣血的區域：每次 6 點；帶著螢光提燈降到 2 點，再戴護腕減半為 1 點', () => {
    const s = deep(traveler());
    expect(harm(s, 'deep_mist').player.hp).toBe(s.player.hp - 6);
    const lit = deep(give(traveler(), 'glow_lantern'));
    expect(harm(lit, 'deep_mist').player.hp).toBe(lit.player.hp - 2);
    const worn = deep(ok(give(give(traveler(), 'glow_lantern'), 'forest_bracer'), { type: 'EquipItem', itemId: 'forest_bracer' }).state);
    expect(harm(worn, 'deep_mist').player.hp).toBe(worn.player.hp - 1);
  });

  it('不會扣血的區域或已經不是濃霧時不扣血', () => {
    expect(handleCommand(deep(traveler()), { type: 'MistHarm', region: 'mist_gate' }, harmCtx)[0]).toMatchObject({ reason: 'not-dense' });
    const light = { ...traveler(), mist: { ...traveler().mist, deep_mist: 'light' as const } };
    expect(handleCommand(light, { type: 'MistHarm', region: 'deep_mist' }, harmCtx)[0]).toMatchObject({ reason: 'not-dense' });
  });
});
