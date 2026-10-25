import { useEffect, useMemo } from 'react';
import { waypointDestinations, waypointNameKey, waypoints } from '@/game-core/world/waypoints';
import { worldIndex } from '@/game/authority';
import { t } from '@/game/i18n';
import { useTouchUi } from '@/game/input/device';
import { input } from '@/game/input/inputManager';
import { travelToWaypoint } from '@/game/location';
import { playerRuntime } from '@/game/player/localRuntime';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { worldDataResult } from '@/game/worldData';

const all = worldDataResult.ok ? waypoints(worldDataResult.data.placements, (id) => worldIndex.prefab(id)) : [];

function close(relock: boolean): void {
  useUiStore.getState().setWaypoint(null);
  if (relock) input.requestPointerLock();
}

function go(id: string): void {
  close(false);
  travelToWaypoint(id);
  input.requestPointerLock();
}

/**
 * 傳送選單（第二章檢討方案 C）：在點亮的星光路標前按互動鍵打開，列出同一張地圖上其他點亮的路標（名稱是 waypoint.name.<id>），
 * 選一個就傳送過去。數字鍵選擇、Esc 或互動鍵關閉。
 */
export function WaypointPanel() {
  const from = useUiStore((s) => s.waypoint);
  const objects = useGameStateStore((s) => s.state.objects);
  const title = useGameStore((s) => s.screen === 'title');
  const touch = useTouchUi();
  const list = useMemo(() => (from ? waypointDestinations(all, objects, from) : []), [from, objects]);

  useEffect(() => {
    if (title) useUiStore.getState().setWaypoint(null);
  }, [title]);

  useEffect(() => {
    if (!from) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || input.isBound(e.code, 'interact')) {
        e.stopImmediatePropagation();
        input.swallowKey(e.code);
        close(true);
        return;
      }
      const n = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)?.[1];
      const target = n ? list[Number(n) - 1] : undefined;
      if (target) {
        input.swallowKey(e.code);
        go(target.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [from, list]);

  if (!from) return null;
  const here = playerRuntime.position;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45" onClick={() => close(true)}>
      <div
        role="dialog"
        aria-labelledby="waypoint-title"
        data-testid="waypoint-panel"
        data-pad-scope
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,26rem)] rounded-2xl border-4 border-emerald-200 bg-slate-900/95 p-5 text-white shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="waypoint-title" className="text-lg font-bold text-emerald-200">
            {t('waypoint.title')}
          </h2>
          {touch && (
            <button type="button" data-testid="waypoint-close" onClick={() => close(true)} className="rounded-full bg-white/15 px-3 py-1 text-sm">
              {t('waypoint.close')}
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-sm leading-6 text-white/80" data-testid="waypoint-empty">
            {t('waypoint.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((w, i) => {
              const meters = Math.round(Math.hypot(w.x - here.x, w.z - here.z));
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    data-testid="waypoint-option"
                    data-waypoint={w.id}
                    onClick={() => go(w.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white/10 px-4 py-2 text-left hover:bg-emerald-500/30"
                  >
                    <kbd className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-sm font-bold text-emerald-950">{i + 1}</kbd>
                    <span className="font-bold">{t(waypointNameKey(w.id))}</span>
                    <span className="ml-auto text-xs text-white/60">{t('waypoint.distance', { m: meters })}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!touch && <p className="mt-3 text-right text-xs text-white/50">{t('waypoint.hint')}</p>}
      </div>
    </div>
  );
}
