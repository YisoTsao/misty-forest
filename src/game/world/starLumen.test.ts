// 第二章 Phase 3：星光照明（規格 10.2）與隱藏的寶箱、污染根瘤（規格 9、§5.2）。
// 照明花星光值、一段時間內揭露隱藏寶箱（沒有照明打不開）、照明過期後又打不開；
// 污染根瘤要一顆純淨螢苔淨化，沒有素材時不會淨化。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, LUMEN_COST, LUMEN_SEC, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { addItems, countItem } from '@/game-core/inventory/inventory';
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
const CACHE = 'hidden_cache_01';
const ROOT = 'corruption_root_01';
const rejection = (s: GameState, cmd: GameCommand) => {
  const e = handleCommand(s, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
};
const apply = (s: GameState, cmd: GameCommand): GameState => {
  const events = handleCommand(s, cmd, ctx);
  const rejected = events.find((e) => e.type === 'CommandRejected');
  if (rejected) throw new Error(`${cmd.type} 被拒絕：${JSON.stringify(rejected)}`);
  return applyEvents(s, events, ctx);
};
const at = (s: GameState, time: number): GameState => ({ ...s, time });

describe('星光照明', () => {
  it('花星光值照明，照明時間內可以打開隱藏的寶箱', () => {
    const s0 = at({ ...initialGameState(), player: { ...initialGameState().player, mp: 50 } }, 100);
    const lit = apply(s0, { type: 'Lumen' });
    expect(lit.player.mp).toBe(50 - LUMEN_COST);
    expect(lit.player.lumenUntil).toBeCloseTo(100 + LUMEN_SEC);
    expect(rejection(lit, { type: 'OpenChest', placementId: CACHE })).toBeNull();
    const opened = apply(lit, { type: 'OpenChest', placementId: CACHE });
    expect(opened.objects.get(CACHE)?.open).toBe(true);
  });

  it('沒有照明時打不開隱藏的寶箱；照明過期後也打不開', () => {
    expect(rejection(at(initialGameState(), 100), { type: 'OpenChest', placementId: CACHE })).toBe('not-revealed');
    const lit = apply({ ...at(initialGameState(), 100), player: { ...initialGameState().player, mp: 50 } }, { type: 'Lumen' });
    expect(rejection(at(lit, 100 + LUMEN_SEC + 1), { type: 'OpenChest', placementId: CACHE })).toBe('not-revealed');
  });

  it('星光不夠時照明被拒絕，不扣星光值', () => {
    const s = { ...at(initialGameState(), 0), player: { ...initialGameState().player, mp: LUMEN_COST - 1 } };
    expect(rejection(s, { type: 'Lumen' })).toBe('no-star-power');
    expect(s.player.mp).toBe(LUMEN_COST - 1);
  });
});

describe('污染根瘤', () => {
  it('用一顆純淨螢苔淨化，根瘤消失；沒有素材時不淨化', () => {
    const cleared = handleCommand(initialGameState(), { type: 'ActivateObject', placementId: ROOT }, ctx);
    expect(cleared[0]).toMatchObject({ type: 'CommandRejected', reason: 'missing-materials' });
    let s = initialGameState();
    s = { ...s, inventory: addItems(s.inventory, [{ itemId: 'pure_glowmoss', count: 1 }], data.items)! };
    s = apply(s, { type: 'ActivateObject', placementId: ROOT });
    expect(s.objects.get(ROOT)?.active).toBe(true);
    expect(countItem(s.inventory, 'pure_glowmoss')).toBe(0);
  });
});
