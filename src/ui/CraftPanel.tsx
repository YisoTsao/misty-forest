import { useEffect } from 'react';
import { missingInputs, unlockedRecipes, type RecipeDef, type StationDef } from '@/game-core/craft/craft';
import { countItem } from '@/game-core/inventory/inventory';
import { authority, crafting, npcs } from '@/game/authority';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { escCloseHint } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();
const itemName = (id: string) => {
  const def = items.get(id);
  return def ? t(def.nameKey) : id;
};

function closeCraft(): void {
  useUiStore.getState().setCraft(null);
  input.requestPointerLock();
}

/**
 * 工作台（任務 7J，Bible §26.1–26.2）：列出這個工作台會做的配方、需要的材料與持有數。
 * 材料不足時列出還缺多少（Bible：不能只顯示「製作失敗」）；製作是權威指令 Craft。和負責的 NPC 對話開啟，Esc 關閉。
 */
export function CraftPanel() {
  const stationId = useUiStore((s) => s.craft);
  const title = useGameStore((s) => s.screen === 'title');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUiStore.getState().craft === null || e.code !== 'Escape') return;
      // 這個 Esc 只用來關工作台，不要再讓暫停選單收到
      e.stopImmediatePropagation();
      closeCraft();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (title) useUiStore.getState().setCraft(null);
  }, [title]);
  const station = crafting.stations.find((s) => s.id === stationId);
  if (!station) return null;
  return <CraftWindow station={station} />;
}

function CraftWindow({ station }: { station: StationDef }) {
  const state = useGameStateStore((s) => s.state);
  const recipes = unlockedRecipes(crafting, station.id, state.quests);
  const owner = npcs.find((n) => n.id === station.npc);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={closeCraft}>
      <div
        role="dialog"
        aria-labelledby="craft-title"
        data-testid="craft"
        data-station={station.id}
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="ui-panel flex max-h-[85vh] w-[min(560px,92vw)] flex-col gap-3 rounded-2xl border-4 border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-2xl"
      >
        <div>
          <h2 id="craft-title" className="text-xl font-bold">
            {t(station.nameKey)}
          </h2>
          {owner && <p className="text-xs text-amber-800">{t('craft.owner', { npc: t(owner.nameKey) })}</p>}
        </div>
        <ul className="flex flex-col gap-2 overflow-y-auto" data-testid="craft-list">
          {recipes.map((r) => (
            <RecipeRow key={r.id} recipe={r} />
          ))}
        </ul>
        <p className="text-xs text-amber-800">{t('craft.hint', { close: escCloseHint() })}</p>
      </div>
    </div>
  );
}

function RecipeRow({ recipe }: { recipe: RecipeDef }) {
  const inventory = useGameStateStore((s) => s.state.inventory);
  const out = items.get(recipe.output.itemId);
  const missing = missingInputs(inventory, recipe);
  return (
    <li className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm" data-testid="craft-row" data-recipe={recipe.id}>
      {out && <ItemIcon icon={out.icon} className="h-9 w-9" />}
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {itemName(recipe.output.itemId)} ×{recipe.output.count}
          <span className="ml-2 text-xs font-normal text-amber-700">{t('craft.owned', { count: countItem(inventory, recipe.output.itemId) })}</span>
        </p>
        <ul className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {recipe.inputs.map((i) => {
            const have = countItem(inventory, i.itemId);
            return (
              <li key={i.itemId} className={have >= i.count ? 'text-emerald-700' : 'text-rose-600'}>
                {itemName(i.itemId)} {Math.min(have, i.count)}/{i.count}
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && (
          <p className="mt-0.5 text-xs font-bold text-rose-600" data-testid="craft-missing">
            {t('craft.missing', { items: missing.map((m) => `${itemName(m.itemId)} ×${m.count}`).join('、') })}
          </p>
        )}
      </div>
      <button
        type="button"
        data-testid="craft-make"
        disabled={missing.length > 0}
        onClick={() => authority.send({ type: 'Craft', recipe: recipe.id })}
        className="rounded-full bg-amber-400 px-4 py-1 font-bold text-amber-950 hover:bg-amber-300 disabled:bg-amber-100 disabled:text-amber-400"
      >
        {t('craft.make')}
      </button>
    </li>
  );
}
