import { useEffect, useState } from 'react';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';

const SHOW_MS = 3200;

/** 進入新區域時在畫面中上方顯示區域名稱與迷霧狀態（只在遊玩中）。 */
export function RegionBanner() {
  const region = useUiStore((s) => s.currentRegion);
  const stage = useGameStateStore((s) => s.state.mist[region]);
  const playing = useGameStore((s) => s.screen === 'playing');
  const [shown, setShown] = useState<{ region: string } | null>(null);

  useEffect(
    () =>
      useUiStore.subscribe((s, prev) => {
        if (s.currentRegion !== prev.currentRegion) setShown({ region: s.currentRegion });
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
        <p className="text-4xl font-black tracking-[0.3em]">{t(`region.${region}`)}</p>
        <p className="mt-1 text-sm tracking-widest opacity-90">{t(`regionMist.${stage}`)}</p>
      </div>
    </div>
  );
}
