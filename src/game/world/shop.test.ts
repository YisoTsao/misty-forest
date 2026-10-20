// 任務 7H：米菈的雜貨補給（Bible §25.2、§26.3）以實際資料驗證——資料規則（不賣任務物品與貨幣）、
// 依任務進度解鎖的庫存、買（扣種籽幣、背包放不下時不交易）、賣（只收一般資源）、存讀檔。
import { describe, expect, it } from 'vitest';
import { applyEvents, handleCommand, initialGameState, type GameCommand, type GameState, type RulesContext } from '@/game-core/authority/rules';
import { pickDialogue } from '@/game-core/dialogue/dialogue';
import { addItems, countItem, createInventory } from '@/game-core/inventory/inventory';
import { availableStock, COIN, parseShops } from '@/game-core/shop/shop';
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
  shops: data.shops,
  allowDebugCommands: true,
};
const SHOP = 'shop_mira_supply';
const shop = data.shops.get(SHOP)!;

function withItems(items: { itemId: string; count: number }[]): GameState {
  return { ...initialGameState(), inventory: addItems(createInventory(), items, data.items)! };
}
function run(state: GameState, cmd: GameCommand) {
  const events = handleCommand(state, cmd, ctx);
  return { state: applyEvents(state, events, ctx), events };
}
function rejection(state: GameState, cmd: GameCommand): string | null {
  const e = handleCommand(state, cmd, ctx).find((x) => x.type === 'CommandRejected');
  return e && e.type === 'CommandRejected' ? e.reason : null;
}

describe('商店資料', () => {
  it('米菈經營；不買賣任務物品與種籽幣；資料錯誤時明確失敗', () => {
    expect(shop.npc).toBe('elder');
    for (const e of [...shop.stock, ...shop.buys]) expect(['quest', 'currency']).not.toContain(data.items.get(e.itemId)?.category);
    const refs = { items: data.items, npcs: new Set(['elder']), quests: new Set<string>() };
    expect(() => parseShops([{ id: 's', nameKey: 'x', npc: 'elder', stock: [{ itemId: 'dawn_resonance', price: 1 }], buys: [] }], refs)).toThrow(/任務物品/);
    expect(() => parseShops([{ id: 's', nameKey: 'x', npc: 'nobody', stock: [{ itemId: 'wood', price: 1 }], buys: [] }], refs)).toThrow(/NPC/);
  });

  it('庫存依任務進度解鎖：第一章完成後才進月露藥膏（任務 12A）', () => {
    const before = availableStock(shop, {}).map((s) => s.itemId);
    expect(before).not.toContain('moondew_salve');
    expect(availableStock(shop, { quest_dawn_003: { status: 'completed' } }).map((s) => s.itemId)).toContain('moondew_salve');
  });

  it('米菈的對話有「看看補給品」', () => {
    const view = data.dialogues.get(pickDialogue(data.npcs.find((n) => n.id === 'elder')!.talk, initialGameState(), { quests: data.quests })!)!;
    const effects = Object.values(view.nodes).flatMap((n) => (n.options ?? []).flatMap((o) => o.effects ?? []));
    expect(effects).toContainEqual({ type: 'openShop', shop: SHOP });
  });
});

describe('買賣', () => {
  it('買：扣種籽幣、拿到物品；錢不夠、沒在賣、數量不合法都被拒絕', () => {
    const potion = shop.stock.find((s) => s.itemId === 'herb_potion')!;
    const s = withItems([{ itemId: COIN, count: 30 }]);
    const r = run(s, { type: 'BuyItem', shop: SHOP, itemId: 'herb_potion', count: 2 });
    expect(r.events).toEqual([
      { type: 'ItemsRemoved', items: [{ itemId: COIN, count: potion.price * 2 }], reason: 'shop' },
      { type: 'ItemsGained', items: [{ itemId: 'herb_potion', count: 2 }], source: `shop:${SHOP}` },
    ]);
    expect(countItem(r.state.inventory, COIN)).toBe(30 - potion.price * 2);
    expect(rejection(s, { type: 'BuyItem', shop: SHOP, itemId: 'herb_potion', count: 3 })).toBe('not-enough-coins');
    expect(rejection(s, { type: 'BuyItem', shop: SHOP, itemId: 'moondew_salve', count: 1 })).toBe('not-for-sale');
    expect(rejection(s, { type: 'BuyItem', shop: SHOP, itemId: 'herb_potion', count: 0 })).toBe('invalid-command');
    expect(rejection(s, { type: 'BuyItem', shop: 'nope', itemId: 'wood', count: 1 })).toBe('invalid-command');
  });

  it('買：背包放不下時不交易，種籽幣不會被扣', () => {
    const full = withItems([{ itemId: COIN, count: 500 }, ...Array.from({ length: 23 }, () => ({ itemId: 'herb_potion', count: 20 }))]);
    expect(rejection(full, { type: 'BuyItem', shop: SHOP, itemId: 'wood', count: 1 })).toBe('inventory-full');
  });

  it('賣：只收一般資源；拿到種籽幣；不夠就賣不了', () => {
    const woodPrice = shop.buys.find((b) => b.itemId === 'wood')!.price;
    const s = withItems([{ itemId: 'wood', count: 5 }, { itemId: 'dawn_resonance', count: 1 }]);
    const r = run(s, { type: 'SellItem', shop: SHOP, itemId: 'wood', count: 5 });
    expect(countItem(r.state.inventory, 'wood')).toBe(0);
    expect(countItem(r.state.inventory, COIN)).toBe(woodPrice * 5);
    expect(rejection(s, { type: 'SellItem', shop: SHOP, itemId: 'wood', count: 6 })).toBe('missing-materials');
    expect(rejection(s, { type: 'SellItem', shop: SHOP, itemId: 'dawn_resonance', count: 1 })).toBe('not-for-sale');
  });
});

describe('使用消耗品（任務 7I）', () => {
  const hurt = (items: { itemId: string; count: number }[], hp: number): GameState => {
    const s = withItems(items);
    return { ...s, player: { ...s.player, hp } };
  };
  it('小瓶草藥水回血；體力滿時不能用；沒有就不能用；不是消耗品不能用', () => {
    const heal = data.items.get('herb_potion')!.use!.heal;
    const r = run(hurt([{ itemId: 'herb_potion', count: 1 }], 40), { type: 'UseItem', itemId: 'herb_potion' });
    expect(r.state.player.hp).toBe(40 + heal);
    expect(countItem(r.state.inventory, 'herb_potion')).toBe(0);
    expect(rejection(hurt([{ itemId: 'herb_potion', count: 1 }], 100), { type: 'UseItem', itemId: 'herb_potion' })).toBe('hp-full');
    expect(rejection(hurt([], 40), { type: 'UseItem', itemId: 'herb_potion' })).toBe('missing-materials');
    expect(rejection(hurt([{ itemId: 'wood', count: 1 }], 40), { type: 'UseItem', itemId: 'wood' })).toBe('not-usable');
  });
  it('月露藥膏回血並解除緩速；回血不超過上限；體力滿也能用來解除緩速', () => {
    const r = run(hurt([{ itemId: 'moondew_salve', count: 2 }], 90), { type: 'UseItem', itemId: 'moondew_salve' });
    expect(r.state.player.hp).toBe(100);
    expect(r.events).toContainEqual({ type: 'PlayerSlowCured' });
    expect(rejection(hurt([{ itemId: 'moondew_salve', count: 1 }], 100), { type: 'UseItem', itemId: 'moondew_salve' })).toBeNull();
  });
});
