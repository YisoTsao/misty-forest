import { useEffect, useRef } from 'react';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { useDebugStore } from '@/game/state/debugStore';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { isModalOpen } from '@/game/state/uiStore';
import { QualitySelector } from './QualitySelector';

/** Esc 造成的「滑鼠鎖定解除」與 keydown 可能同時到達，這段時間內不重複切換 */
const TOGGLE_GUARD_MS = 300;

/**
 * 暫停選單（規格 6.9）。遊玩中按 Esc（或滑鼠鎖定被解除）時開啟：
 * 繼續遊戲、畫質設定、回到主選單。
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
        data-testid="pause-menu"
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
        <div className="text-sm">
          <span className="mb-1 block px-1 opacity-80">{t('settings.quality')}</span>
          <QualitySelector />
        </div>
        <button
          type="button"
          data-testid="pause-to-title"
          onClick={() => send('returnToTitle')}
          className="rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('pause.toTitle')}
        </button>
        <p className="text-center text-xs opacity-60">{t('pause.unsavedNote')}</p>
      </div>
    </div>
  );
}
