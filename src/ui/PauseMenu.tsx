import { useEffect, useRef, useState } from 'react';
import { t } from '@/game/i18n';
import { exportMainSave, saveGame } from '@/game/save/saveService';
import { returnToTitle } from '@/game/session';
import { useSaveStore } from '@/game/state/saveStore';
import { input } from '@/game/input/inputManager';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { setWorldMapOpen } from './map/WorldMap';

/** Esc 造成的「滑鼠鎖定解除」與 keydown 可能同時到達，這段時間內不重複切換 */
const TOGGLE_GUARD_MS = 300;

/**
 * 暫停選單（規格 6.9）。遊玩中按 Esc（或滑鼠鎖定被解除）時開啟：
 * 繼續遊戲、儲存、匯出存檔、畫質設定、回到主選單（回主選單前自動存檔）。
 */
export function PauseMenu() {
  const screen = useGameStore((s) => s.screen);
  const send = useGameStore((s) => s.send);
  const lastToggle = useRef(0);

  useEffect(() => {
    const toggle = (action: 'pause' | 'resume') => {
      const now = performance.now();
      if (now - lastToggle.current < TOGGLE_GUARD_MS) return;
      lastToggle.current = now;
      send(action);
    };
    // 跟隨攝影機遊玩中失去滑鼠鎖定（Esc、切換視窗）→ 暫停；訊息視窗或切到自由視角造成的解除不算
    const onLockChange = () => {
      if (document.pointerLockElement) return;
      if (currentScreen() !== 'playing' || isModalOpen() || useDebugStore.getState().cameraMode !== 'follow') return;
      toggle('pause');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat || isModalOpen()) return;
      const screenNow = currentScreen();
      if (screenNow === 'playing') {
        if (document.pointerLockElement) document.exitPointerLock();
        toggle('pause');
      } else if (screenNow === 'paused') {
        toggle('resume');
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [send]);

  if (screen !== 'paused') return null;

  const resume = () => {
    lastToggle.current = performance.now();
    send('resume');
    // 按鈕點擊屬於使用者手勢，可直接重新鎖定滑鼠
    input.requestPointerLock();
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-labelledby="pause-title"
        data-testid="pause-menu" data-pad-scope
        className="flex w-80 flex-col gap-3 rounded-2xl bg-slate-900/85 p-6 text-white shadow-2xl"
      >
        <h2 id="pause-title" className="mb-2 text-center text-2xl font-bold">
          {t('pause.title')}
        </h2>
        <button
          type="button"
          data-testid="pause-resume"
          autoFocus
          onClick={resume}
          className="rounded-full bg-amber-400 py-2 font-bold text-amber-950 hover:bg-amber-300"
        >
          {t('pause.resume')}
        </button>
        <SaveControls />
        <button
          type="button"
          data-testid="pause-map"
          onClick={() => setWorldMapOpen(true)}
          className="rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('pause.map')}
        </button>
        <button
          type="button"
          data-testid="pause-settings"
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
          className="rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('settings.open')}
        </button>
        <button
          type="button"
          data-testid="pause-to-title"
          onClick={() => void returnToTitle()}
          className="rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('pause.toTitle')}
        </button>
        <p className="text-center text-xs opacity-60">{t('pause.autosaveNote')}</p>
      </div>
    </div>
  );
}

/** 手動存檔與匯出，以及最後一次存檔的狀態 */
function SaveControls() {
  const { saving, lastSavedAt, saveError } = useSaveStore();
  const [exportError, setExportError] = useState<string | null>(null);
  const onExport = async () => {
    setExportError(null);
    try {
      if (await saveGame()) await exportMainSave();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  };
  const status = saving
    ? t('save.saving')
    : saveError
      ? `${t('save.failed')}：${saveError}`
      : lastSavedAt
        ? `${t('save.savedAt')} ${new Date(lastSavedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
        : '';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="pause-save"
          disabled={saving}
          onClick={() => void saveGame()}
          className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25 disabled:opacity-60"
        >
          {t('pause.save')}
        </button>
        <button
          type="button"
          data-testid="pause-export"
          disabled={saving}
          onClick={() => void onExport()}
          className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25 disabled:opacity-60"
        >
          {t('pause.export')}
        </button>
      </div>
      <p data-testid="save-status" className={`min-h-4 text-center text-xs ${saveError || exportError ? 'text-rose-300' : 'opacity-70'}`}>
        {exportError ? `${t('save.exportFailed')}：${exportError}` : status}
      </p>
    </div>
  );
}
