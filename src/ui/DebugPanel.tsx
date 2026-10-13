import { mistLevelOf, mistStages } from '@/game-core/world/mist';
import { useDebugStore } from '@/game/state/debugStore';
import { t } from '@/game/i18n';
import { cameraBookmarks } from '@/game/worldData';
import { QualitySelector } from './QualitySelector';

/** 攝影機書籤切換（截圖驗收與美術比對用）。 */
export function DebugPanel() {
  const mode = useDebugStore((s) => s.cameraMode);
  const current = useDebugStore((s) => (s.cameraMode === 'free' ? s.bookmark?.id : undefined));
  const requestBookmark = useDebugStore((s) => s.requestBookmark);
  const setCameraMode = useDebugStore((s) => s.setCameraMode);
  const mist = useDebugStore((s) => s.mistTarget);
  const setMist = useDebugStore((s) => s.setMistTarget);

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
      {/* 規格 4.5：Phase 1 以除錯滑桿切換晴朗 / 迷霧；Phase 3 才接任務 */}
      <label htmlFor="debug-mist" className="mt-2 flex justify-between px-1 opacity-70">
        <span>{t('debug.mist')}</span>
        <span className="font-mono">{mist.toFixed(2)}</span>
      </label>
      <input
        id="debug-mist"
        data-testid="mist-slider"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={mist}
        onChange={(e) => setMist(Number(e.target.value))}
        className="mx-1 accent-sky-300"
      />
      <div className="flex gap-1">
        {mistStages.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setMist(mistLevelOf(stage))}
            className={`flex-1 rounded px-1 py-1 hover:bg-white/20 ${mist === mistLevelOf(stage) ? 'bg-white/25' : ''}`}
          >
            {t(`mist.${stage}`)}
          </button>
        ))}
      </div>
      <span className="mt-2 px-1 opacity-70">{t('settings.quality')}</span>
      <QualitySelector />
    </div>
  );
}
