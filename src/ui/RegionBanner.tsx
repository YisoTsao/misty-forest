import { useEffect, useState } from 'react';
import { hasText, t } from '@/game/i18n';
import { keyVars } from '@/game/input/keyLabels';
import { useBindings } from '@/game/state/settingsStore';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { regions } from '@/game/authority';
import { mapIdAt, MAPS, type MapId } from '@/game-core/world/maps';
import type { RegionId } from '@/game-core/world/types';

/** 區域所在的地圖（沒有範圍的預設區域屬於晨曦谷地） */
function mapOfRegion(id: RegionId): MapId {
  const area = regions.find((r) => r.id === id)?.area;
  return area ? mapIdAt(area.center[0], area.center[1]) : 'dawnvale';
}

const SHOW_MS = 3200;

/** 進入新區域時在畫面中上方顯示區域名稱與迷霧狀態（只在遊玩中）。 */
export function RegionBanner() {
  const region = useUiStore((s) => s.currentRegion);
  const stage = useGameStateStore((s) => s.state.mist[region]);
  const playing = useGameStore((s) => s.screen === 'playing');
  const [shown, setShown] = useState<{ region: string; map: MapId | null } | null>(null);
  const bindings = useBindings();

  useEffect(
    () =>
      useUiStore.subscribe((s, prev) => {
        if (s.currentRegion === prev.currentRegion) return;
        // 換了地圖（任務 8A）：區域名稱上方加上地圖名稱
        const map = mapOfRegion(s.currentRegion);
        setShown({ region: s.currentRegion, map: map !== mapOfRegion(prev.currentRegion) ? map : null });
      }),
    [],
  );
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!playing || !shown || shown.region !== region) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[26%] flex justify-center">
      <div data-testid="region-banner" className="animate-region text-center text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        {shown.map && (
          <p data-testid="region-banner-map" className="mb-1 text-lg font-bold tracking-[0.4em] text-emerald-100">
            {t(MAPS[shown.map].nameKey)}
          </p>
        )}
        <p className="text-4xl font-black tracking-[0.3em]">{t(`region.${region}`)}</p>
        <p className="mt-1 text-sm tracking-widest opacity-90">{t(`regionMist.${stage}`)}</p>
        {hasText(`regionHint.${region}`) && <p className="mt-2 text-sm font-bold tracking-wide text-amber-200">{t(`regionHint.${region}`, keyVars(bindings))}</p>}
      </div>
    </div>
  );
}
