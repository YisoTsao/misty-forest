import { useEffect, useState } from 'react';
import type { InventorySlot } from '@/game-core/inventory/inventory';
import { authority } from '@/game/authority';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { actionKey } from '@/game/input/keyLabels';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();

/**
 * 背包（規格 6.3）：格子、圖示、數量、說明。I / Tab（可重新配置）開關，Esc 也可關閉。
 * 開啟時釋放滑鼠、角色停止移動（isModalOpen）；只讀權威狀態，不直接修改背包。
 */
export function InventoryPanel() {
  const open = useUiStore((s) => s.inventoryOpen);
  const playing = useGameStore((s) => s.screen === 'playing');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const ui = useUiStore.getState();
      if (ui.inventoryOpen && (e.code === 'Escape' || input.isBound(e.code, 'inventory'))) {
        // 這個 Esc 只用來關背包，不要再讓暫停選單收到
        e.stopImmediatePropagation();
        ui.setInventoryOpen(false);
        // 鍵盤事件屬於使用者手勢，可直接重新鎖定滑鼠回到遊玩
        input.requestPointerLock();
        return;
      }
      if (!input.isBound(e.code, 'inventory') || currentScreen() !== 'playing' || ui.message) return;
      ui.setInventoryOpen(true);
      if (document.pointerLockElement) document.exitPointerLock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 暫停或回到主選單時關閉
  useEffect(() => {
    if (!playing) useUiStore.getState().setInventoryOpen(false);
  }, [playing]);

  if (!open) return null;
  return <InventoryWindow />;
}

function InventoryWindow() {
  const slots = useGameStateStore((s) => s.state.inventory.slots);
  const [selected, setSelected] = useState<number | null>(null);
  const inventoryKey = actionKey(useBindings(), 'inventory');
  const close = () => useUiStore.getState().setInventoryOpen(false);
  // 預設選取第一個有物品的格子
  const index = selected ?? slots.findIndex((s) => s !== null);
  const slot = index >= 0 ? (slots[index] ?? null) : null;
  const def = slot ? items.get(slot.itemId) : undefined;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/25" onClick={close}>
      <div
        role="dialog"
        aria-labelledby="inventory-title"
        data-testid="inventory" data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="flex gap-5 rounded-2xl border-4 border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-2xl"
      >
        <div>
          <h2 id="inventory-title" className="mb-3 text-xl font-bold">
            {t('inventory.title')}
          </h2>
          <div className="grid grid-cols-6 gap-2">
            {slots.map((s, i) => (
              <SlotButton key={i} slot={s} active={i === index && s !== null} onSelect={() => setSelected(i)} />
            ))}
          </div>
        </div>
        <div className="flex w-56 flex-col" data-testid="inventory-detail">
          {def && slot ? (
            <>
              <ItemIcon icon={def.icon} className="mx-auto mt-8 h-24 w-24" />
              <h3 className="mt-3 text-center text-lg font-bold">{t(def.nameKey)}</h3>
              <p className="text-center text-sm opacity-70">
                {t(`inventory.category.${def.category}`)} · {t('inventory.owned')} {slot.count}
              </p>
              <p className="mt-3 text-sm leading-6">{t(def.descKey)}</p>
              {def.use && (
                <button
                  type="button"
                  data-testid="inventory-use"
                  onClick={() => authority.send({ type: 'UseItem', itemId: def.id })}
                  className="mt-3 rounded-full bg-emerald-500 px-4 py-1.5 font-bold text-white hover:bg-emerald-600"
                >
                  {t('inventory.use', { heal: def.use.heal })}
                </button>
              )}
            </>
          ) : (
            <p className="mt-16 text-center text-sm whitespace-pre-line opacity-60">{t('inventory.empty')}</p>
          )}
          <div className="mt-auto flex items-center justify-end gap-3 pt-4">
            <span className="text-xs opacity-60">{t('inventory.closeHint', { inventory: inventoryKey })}</span>
            <button type="button" onClick={close} className="rounded-full bg-amber-500 px-5 py-1.5 font-bold text-white hover:bg-amber-600">
              {t('inventory.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlotButton({ slot, active, onSelect }: { slot: InventorySlot; active: boolean; onSelect: () => void }) {
  const def = slot ? items.get(slot.itemId) : undefined;
  return (
    <button
      type="button"
      data-testid="inventory-slot"
      data-item={slot?.itemId ?? ''}
      disabled={!slot}
      onClick={onSelect}
      onMouseEnter={slot ? onSelect : undefined}
      title={def ? t(def.nameKey) : undefined}
      className={`relative h-16 w-16 rounded-xl border-2 ${
        active ? 'border-amber-500 bg-amber-200' : 'border-amber-200 bg-white/70'
      } ${slot ? 'hover:border-amber-400' : ''}`}
    >
      {def && slot && (
        <>
          <ItemIcon icon={def.icon} className="absolute inset-1.5" />
          <span className="absolute right-1 bottom-0.5 text-sm font-bold text-amber-950 [text-shadow:0_0_3px_white]">{slot.count}</span>
        </>
      )}
    </button>
  );
}
