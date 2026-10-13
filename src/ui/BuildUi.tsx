import { useEffect, useRef } from 'react';
import { countItem } from '@/game-core/inventory/inventory';
import { authority, buildables } from '@/game/authority';
import { buildRuntime, REMOVE_TOOL } from '@/game/build/buildRuntime';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { keyVars } from '@/game/input/keyLabels';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useBindings } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';
import { ItemIcon } from './ItemIcon';

const items = worldDataResult.ok ? worldDataResult.data.items : new Map();
const list = [...buildables.values()];

/** 建造模式的介面（規格 6.7）：選單（選建造物、看材料）與放置時的狀態列。 */
export function BuildUi() {
  const build = useUiStore((s) => s.build);
  const playing = useGameStore((s) => s.screen === 'playing');

  // Esc：選單開著時關閉選單，否則離開建造模式（不開暫停選單）
  useEffect(() => {
    if (!build) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat) return;
      e.stopImmediatePropagation();
      const ui = useUiStore.getState();
      if (ui.build?.menu && ui.build.selected) ui.setBuild({ ...ui.build, menu: false });
      else ui.setBuild(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [build]);

  if (!build || !playing) return null;
  if (build.menu) return <BuildMenu />;
  if (build.selected === REMOVE_TOOL) return <RemoveStatus />;
  return build.selected ? <BuildStatus buildable={build.selected} /> : null;
}

function Cost({ cost }: { cost: { itemId: string; count: number }[] }) {
  const inventory = useGameStateStore((s) => s.state.inventory);
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {cost.map((c) => {
        const def = items.get(c.itemId);
        const have = countItem(inventory, c.itemId);
        return (
          <span key={c.itemId} className={`flex items-center gap-0.5 text-xs ${have >= c.count ? '' : 'text-rose-500'}`}>
            {def && <ItemIcon icon={def.icon} className="h-4 w-4" />}
            {have}/{c.count}
          </span>
        );
      })}
    </span>
  );
}

function BuildMenu() {
  const bindings = useBindings();
  const choose = (id: string) => {
    useUiStore.getState().setBuild({ menu: false, selected: id });
    buildRuntime.ready = false;
    input.requestPointerLock();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = /^Digit([0-9])$/.exec(e.code)?.[1];
      if (!n) return;
      const item = list[(Number(n) + 9) % 10];
      if (item) choose(item.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
      <div role="dialog" data-testid="build-menu" data-pad-scope className="w-[min(94vw,40rem)] rounded-2xl border-4 border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-2xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{t('build.title')}</h2>
          <span className="text-xs opacity-60">{t('build.menuHint', keyVars(bindings))}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {list.map((b, i) => (
            <button
              key={b.id}
              type="button"
              data-testid={`build-option-${b.id}`}
              onClick={() => choose(b.id)}
              className="flex items-center gap-3 rounded-xl border-2 border-amber-200 bg-white/80 px-3 py-2 text-left hover:border-amber-400 hover:bg-amber-100"
            >
              <kbd className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold">{(i + 1) % 10}</kbd>
              <ItemIcon icon={b.icon} className="h-10 w-10 shrink-0" />
              <span className="flex flex-col gap-0.5">
                <span className="font-bold">
                  {t(b.nameKey)} <span className="text-xs font-normal opacity-60">{t(`build.category.${b.category}`)}</span>
                </span>
                <Cost cost={b.cost} />
              </span>
            </button>
          ))}
          <button
            type="button"
            data-testid="build-option-remove"
            onClick={() => choose(REMOVE_TOOL)}
            className="col-span-2 flex items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white/80 px-3 py-2 font-bold text-rose-700 hover:border-rose-400 hover:bg-rose-50"
          >
            {t('build.remove')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 拆除工具的狀態列：對準的建造物名稱 */
function RemoveStatus() {
  const bindings = useBindings();
  const buildings = useGameStateStore((s) => s.state.buildings);
  const labelRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const target = buildings.find((b) => b.id === buildRuntime.removeTarget);
      const def = target && buildables.get(target.buildable);
      const text = def ? t('build.removeTarget', { name: t(def.nameKey) }) : t('build.removeNone');
      if (text !== last && labelRef.current) {
        labelRef.current.textContent = text;
        last = text;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [buildings]);
  useEffect(
    () =>
      authority.subscribe((events) => {
        for (const e of events) {
          if (e.type !== 'BuildingRemoved') continue;
          const removed = buildings.find((b) => b.id === e.buildingId);
          const def = removed && buildables.get(removed.buildable);
          if (def) useUiStore.getState().pushToast({ textKey: 'build.removed', vars: { name: t(def.nameKey) } });
        }
      }),
    [buildings],
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
      <div data-testid="build-status" className="flex flex-col items-center gap-1 rounded-2xl bg-black/55 px-5 py-2 text-sm text-white shadow-lg">
        <span ref={labelRef} data-testid="build-remove-target" className="font-bold text-rose-200" />
        <span className="text-xs opacity-80">{t('build.removeHint', keyVars(bindings))}</span>
      </div>
    </div>
  );
}

/** 放置中：建造物名稱、材料、目前能不能放（每幀更新文字，不經過 React state） */
function BuildStatus({ buildable }: { buildable: string }) {
  const def = buildables.get(buildable);
  const bindings = useBindings();
  const statusRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const loop = () => {
      const problem = buildRuntime.problem;
      const text = problem ? t(`build.problem.${problem}`) : t('build.ok');
      if (text !== last && statusRef.current) {
        statusRef.current.textContent = text;
        statusRef.current.dataset.ok = String(problem === null);
        statusRef.current.className = `font-bold ${problem ? 'text-rose-300' : 'text-emerald-300'}`;
        last = text;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // 剛放下時給一個通知
  useEffect(
    () =>
      authority.subscribe((events) => {
        for (const e of events) {
          if (e.type !== 'BuildingPlaced') continue;
          const placed = buildables.get(e.building.buildable);
          if (placed) useUiStore.getState().pushToast({ textKey: 'build.placed', vars: { name: t(placed.nameKey) } });
        }
      }),
    [],
  );
  if (!def) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center">
      <div data-testid="build-status" className="flex flex-col items-center gap-1 rounded-2xl bg-black/55 px-5 py-2 text-sm text-white shadow-lg">
        <div className="flex items-center gap-3">
          <ItemIcon icon={def.icon} className="h-7 w-7" />
          <span className="font-bold">{t(def.nameKey)}</span>
          <span className="rounded-lg bg-white/90 px-2 py-0.5 text-amber-950">
            <Cost cost={def.cost} />
          </span>
          <span ref={statusRef} data-testid="build-problem" />
        </div>
        <span className="text-xs opacity-80">{t('build.hint', keyVars(bindings))}</span>
      </div>
    </div>
  );
}
