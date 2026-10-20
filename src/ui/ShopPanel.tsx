import { useEffect, useState } from 'react';
import { countItem } from '@/game-core/inventory/inventory';
import { availableStock, COIN, MAX_TRADE, type ShopDef } from '@/game-core/shop/shop';
import { authority, npcs, shops } from '@/game/authority';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

function closeShop(): void {
  useUiStore.getState().setShop(null);
  input.requestPointerLock();
}

/**
 * 商店（任務 7H，Bible §26.3）：購買 / 出售兩個分頁，以種籽幣交易。和店主對話選「看看補給品」開啟，Esc 關閉。
 * 買賣都是權威指令（BuyItem / SellItem），這裡只顯示價格、持有數與不能交易的原因。
 */
export function ShopPanel() {
  const shopId = useUiStore((s) => s.shop);
  const title = useGameStore((s) => s.screen === 'title');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUiStore.getState().shop === null || e.code !== 'Escape') return;
      // 這個 Esc 只用來關商店，不要再讓暫停選單收到
      e.stopImmediatePropagation();
      closeShop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (title) useUiStore.getState().setShop(null);
  }, [title]);

  const shop = shopId ? shops.get(shopId) : undefined;
  if (!shop) return null;
  return <ShopWindow shop={shop} />;
}

type Tab = 'buy' | 'sell';

function ShopWindow({ shop }: { shop: ShopDef }) {
  const state = useGameStateStore((s) => s.state);
  const [tab, setTab] = useState<Tab>('buy');
  const coins = countItem(state.inventory, COIN);
  const owner = npcs.find((n) => n.id === shop.npc);
  const rows = tab === 'buy' ? availableStock(shop, state.quests) : shop.buys;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={closeShop}>
      <div
        role="dialog"
        aria-labelledby="shop-title"
        data-testid="shop"
        data-shop={shop.id}
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="ui-panel flex max-h-[85vh] w-[min(560px,92vw)] flex-col gap-3 rounded-2xl border-4 border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="shop-title" className="text-xl font-bold">
              {t(shop.nameKey)}
            </h2>
            {owner && <p className="text-xs text-amber-800">{t('shop.owner', { npc: t(owner.nameKey) })}</p>}
          </div>
          <p className="flex items-center gap-1 rounded-full bg-amber-200 px-3 py-1 font-bold" data-testid="shop-coins">
            <ItemIcon icon="seed_coin" className="h-5 w-5" />
            {coins}
          </p>
        </div>
        <div className="flex gap-2" role="tablist">
          {(['buy', 'sell'] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-testid={`shop-tab-${id}`}
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-1 text-sm font-bold ${tab === id ? 'bg-amber-500 text-white' : 'bg-amber-200/70 hover:bg-amber-200'}`}
            >
              {t(`shop.tab.${id}`)}
            </button>
          ))}
        </div>
        <ul className="flex flex-col gap-1.5 overflow-y-auto" data-testid="shop-list">
          {rows.map((r) => (
            <ShopRow key={r.itemId} shop={shop} tab={tab} itemId={r.itemId} price={r.price} owned={countItem(state.inventory, r.itemId)} coins={coins} />
          ))}
        </ul>
        <p className="text-xs text-amber-800">{t(tab === 'buy' ? 'shop.hint.buy' : 'shop.hint.sell')}</p>
      </div>
    </div>
  );
}

function ShopRow({ shop, tab, itemId, price, owned, coins }: { shop: ShopDef; tab: Tab; itemId: string; price: number; owned: number; coins: number }) {
  const def = items.get(itemId);
  const [count, setCount] = useState(1);
  const max = tab === 'buy' ? Math.max(1, Math.min(MAX_TRADE, Math.floor(coins / price))) : Math.max(1, Math.min(MAX_TRADE, owned));
  const n = Math.min(count, max);
  const total = price * n;
  const blocked = tab === 'buy' ? coins < total : owned < n;
  return (
    <li className="flex items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-sm" data-testid="shop-row" data-item={itemId}>
      {def && <ItemIcon icon={def.icon} className="h-7 w-7" />}
      <div className="min-w-0 flex-1">
        <p className="font-bold">{def ? t(def.nameKey) : itemId}</p>
        <p className="text-xs text-amber-800">
          {t('shop.price', { price })} · {t('shop.owned', { count: owned })}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="−" onClick={() => setCount(Math.max(1, n - 1))} className="h-6 w-6 rounded-full bg-amber-200 font-bold hover:bg-amber-300">
          −
        </button>
        <span className="w-6 text-center font-mono" data-testid="shop-count">
          {n}
        </span>
        <button type="button" aria-label="+" onClick={() => setCount(Math.min(max, n + 1))} className="h-6 w-6 rounded-full bg-amber-200 font-bold hover:bg-amber-300">
          +
        </button>
      </div>
      <button
        type="button"
        data-testid="shop-trade"
        disabled={blocked}
        title={blocked ? t(tab === 'buy' ? 'shop.noCoins' : 'shop.noItems') : undefined}
        onClick={() => authority.send(tab === 'buy' ? { type: 'BuyItem', shop: shop.id, itemId, count: n } : { type: 'SellItem', shop: shop.id, itemId, count: n })}
        className="w-24 rounded-full bg-amber-400 py-1 font-bold text-amber-950 hover:bg-amber-300 disabled:bg-amber-100 disabled:text-amber-400"
      >
        {t(tab === 'buy' ? 'shop.buy' : 'shop.sell', { total })}
      </button>
    </li>
  );
}
