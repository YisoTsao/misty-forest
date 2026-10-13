import { useEffect, useState } from 'react';
import { mistLevelOf, mistStages } from '@/game-core/world/mist';
import { formatClock } from '@/game-core/world/timeOfDay';
import { authority } from '@/game/authority';
import { t } from '@/game/i18n';
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStateStore } from '@/game/state/gameStateStore';
import { useUiStore } from '@/game/state/uiStore';
import { timeRuntime } from '@/game/world/timeRuntime';
import { cameraBookmarks } from '@/game/worldData';
import { QualitySelector } from './QualitySelector';

/** 除錯面板：攝影機書籤、迷霧（畫面覆寫與區域階段）、畫質（截圖驗收與美術比對用）。 */
export function DebugPanel() {
  const mode = useDebugStore((s) => s.cameraMode);
  const current = useDebugStore((s) => (s.cameraMode === 'free' ? s.bookmark?.id : undefined));
  const requestBookmark = useDebugStore((s) => s.requestBookmark);
  const setCameraMode = useDebugStore((s) => s.setCameraMode);
  const override = useDebugStore((s) => s.mistOverride);
  const setOverride = useDebugStore((s) => s.setMistOverride);
  const region = useUiStore((s) => s.currentRegion);
  const stage = useGameStateStore((s) => s.state.mist[region]);

  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg bg-black/55 p-2 text-xs text-white">
      <button
        type="button"
        onClick={() => setCameraMode('follow')}
        className={`rounded px-2 py-1 text-left hover:bg-white/20 ${mode === 'follow' ? 'bg-white/25' : ''}`}
      >
        {t('debug.followCamera')}
      </button>
      <span className="mt-1 px-1 opacity-70">{t('debug.bookmarks')}</span>
      {cameraBookmarks.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => requestBookmark(b.id)}
          className={`rounded px-2 py-1 text-left hover:bg-white/20 ${current === b.id ? 'bg-white/25' : ''}`}
        >
          {t(`bookmark.${b.id}`)}
        </button>
      ))}
      {/* 規格 4.5：畫面迷霧可直接覆寫（美術驗收）；平常依所在區域的迷霧階段 */}
      <label htmlFor="debug-mist" className="mt-2 flex justify-between px-1 opacity-70">
        <span>{t('debug.mist')}</span>
        <span className="font-mono">{override === null ? t('debug.mistByRegion') : override.toFixed(2)}</span>
      </label>
      <input
        id="debug-mist"
        data-testid="mist-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={override ?? 0}
        onChange={(e) => setOverride(Number(e.target.value))}
        className="mx-1 accent-sky-300"
      />
      <button
        type="button"
        data-testid="mist-by-region"
        onClick={() => setOverride(null)}
        className={`rounded px-2 py-1 hover:bg-white/20 ${override === null ? 'bg-white/25' : ''}`}
      >
        {t('debug.mistByRegion')}
      </button>
      <span className="mt-1 px-1 opacity-70">
        {t('debug.regionStage', { region: t(`region.${region}`) })}
      </span>
      <div className="flex gap-1">
        {mistStages.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`region-stage-${s}`}
            title={String(mistLevelOf(s))}
            onClick={() => authority.send({ type: 'DebugSetMistStage', region, stage: s })}
            className={`flex-1 rounded px-1 py-1 hover:bg-white/20 ${stage === s ? 'bg-white/25' : ''}`}
          >
            {t(`mist.${s}`)}
          </button>
        ))}
      </div>
      <ClockControl />
      <span className="mt-2 px-1 opacity-70">{t('settings.quality')}</span>
      <QualitySelector />
    </div>
  );
}

/** 日夜（GAME_DESIGN 5.2）：時段滑桿。拖動時以除錯指令把時間往前推到該時刻（只往前，不倒轉）。 */
function ClockControl() {
  const [hour, setHour] = useState(timeRuntime.hour);
  useEffect(() => {
    const timer = window.setInterval(() => setHour(timeRuntime.hour), 500);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <>
      <label htmlFor="debug-clock" className="mt-2 flex justify-between px-1 opacity-70">
        <span>{t('debug.clock')}</span>
        <span className="font-mono">{formatClock(hour)}</span>
      </label>
      <input
        id="debug-clock"
        data-testid="clock-slider"
        type="range"
        min={0}
        max={23.75}
        step={0.25}
        value={Math.floor(hour * 4) / 4}
        onChange={(e) => {
          const h = Number(e.target.value);
          authority.send({ type: 'DebugSetClock', hour: h });
          setHour(h);
        }}
        className="mx-1 accent-amber-300"
      />
    </>
  );
}
