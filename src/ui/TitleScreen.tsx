import { useState } from 'react';
import { t } from '@/game/i18n';
import { continueGame, startNewGame } from '@/game/session';
import { useGameStore } from '@/game/state/gameStore';
import { useSaveStore } from '@/game/state/saveStore';
import { useUiStore } from '@/game/state/uiStore';
import { useOnlineStore } from '@/online/onlineStore';
import { ClassPicker } from './ClassPicker';
import { OnlinePanel } from './OnlinePanel';
import { formatPlayTime, formatSavedAt } from './saveFormat';

type TitleMode = 'offline' | 'online';
const MODE_KEY = 'mistwood.titleMode';

/** 上次選的模式（每個瀏覽器 / 裝置各自記住；讀不到時預設單機） */
function rememberedMode(): TitleMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'online' ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

function rememberMode(mode: TitleMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 私密視窗或封鎖儲存時不記住
  }
}

/**
 * 主選單（規格 6.9，任務 11L-2）：上方切換「單機遊玩 / 線上遊玩」，兩者的資料完全分開（DECISIONS T-179）。
 * 單機：繼續遊戲、新遊戲（本機存檔）。線上：登入後進入線上世界（資料庫的線上角色）。設定與離開兩邊共用。
 * 背景是緩慢環繞的實際場景。
 */
export function TitleScreen() {
  const screen = useGameStore((s) => s.screen);
  if (screen !== 'title') return null;
  return <TitleMenu />;
}

function TitleMenu() {
  const [mode, setMode] = useState<TitleMode>(rememberedMode);
  const motd = useOnlineStore((s) => s.config?.motd ?? null);
  const pick = (next: TitleMode) => {
    setMode(next);
    rememberMode(next);
  };
  const tab = (value: TitleMode) =>
    `flex-1 rounded-full py-2 text-sm font-bold transition-colors ${mode === value ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:bg-white/10'}`;

  return (
    <div
      data-testid="title-screen" data-pad-scope
      className="absolute inset-0 flex flex-col items-center justify-center-safe overflow-y-auto py-3 bg-gradient-to-b from-sky-900/10 via-transparent to-emerald-950/45"
    >
      <div className="rounded-3xl bg-slate-900/25 px-12 py-6 backdrop-blur-[2px] max-sm:px-5 [@media(max-height:480px)]:py-2">
        <h1 className="text-center text-6xl max-sm:text-4xl [@media(max-height:480px)]:text-4xl font-black tracking-wider text-white drop-shadow-[0_4px_12px_rgba(20,60,90,0.55)]">
          {t('app.title')}
        </h1>
        <p className="mt-3 text-center text-lg text-white/90 drop-shadow">{t('title.subtitle')}</p>
        {motd && (
          <p data-testid="title-motd" className="mt-2 text-center text-sm text-amber-100 drop-shadow">
            {motd}
          </p>
        )}
      </div>
      <div className="mt-10 [@media(max-height:480px)]:mt-3 flex w-[min(92vw,22rem)] flex-col gap-3 rounded-2xl bg-black/35 p-5 text-white backdrop-blur-sm">
        <div role="tablist" aria-label={t('title.modeLabel')} className="flex gap-1 rounded-full bg-black/30 p-1">
          <button type="button" role="tab" aria-selected={mode === 'offline'} data-testid="title-mode-offline" onClick={() => pick('offline')} className={tab('offline')}>
            {t('title.mode.offline')}
          </button>
          <button type="button" role="tab" aria-selected={mode === 'online'} data-testid="title-mode-online" onClick={() => pick('online')} className={tab('online')}>
            {t('title.mode.online')}
          </button>
        </div>
        <p className="-mt-1 text-center text-xs opacity-70">{t(mode === 'offline' ? 'title.mode.offlineHint' : 'title.mode.onlineHint')}</p>

        {mode === 'offline' ? <OfflineMenu /> : <OnlinePanel />}

        <div className="mt-1 flex gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            data-testid="title-settings"
            onClick={() => useUiStore.getState().setSettingsOpen(true)}
            className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25"
          >
            {t('settings.open')}
          </button>
          {/* 網頁上 window.close() 對一般分頁無效，只在桌面版（Electron）顯示 */}
          {window.mistwood?.isElectron && (
            <button type="button" data-testid="title-quit" onClick={() => window.close()} className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25">
              {t('title.quit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 單機：繼續遊戲（本機存檔）、新遊戲 */
function OfflineMenu() {
  const save = useSaveStore((s) => s.mainSave);
  const [confirmNew, setConfirmNew] = useState(false);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasSave = save.status === 'ok' || save.status === 'restored-from-backup';

  const onContinue = async () => {
    setLoading(true);
    const ok = await continueGame();
    // 成功時主選單已卸載；失敗時存檔狀態已更新為損壞，畫面會顯示原因
    if (!ok) setLoading(false);
  };
  // 新遊戲：有存檔時先確認，再選職業
  const onNew = () => {
    if (hasSave && !confirmNew) setConfirmNew(true);
    else setPicking(true);
  };

  if (picking) return <ClassPicker onStart={startNewGame} onBack={() => setPicking(false)} />;

  return (
    <div data-testid="offline-panel" className="flex flex-col gap-3">
      {hasSave && (
        <button
          type="button"
          data-testid="title-continue"
          autoFocus
          disabled={loading}
          onClick={() => void onContinue()}
          className="rounded-full bg-amber-400 py-2 font-bold text-amber-950 shadow hover:bg-amber-300 disabled:opacity-60"
        >
          <span className="block text-lg">{t('title.continue')}</span>
          <span className="block text-xs font-normal opacity-80" data-testid="title-save-info">
            {formatSavedAt(save.savedAt)} · {t('title.playTime')} {formatPlayTime(save.playTime)}
          </span>
        </button>
      )}
      {confirmNew ? (
        <div className="rounded-xl bg-white/10 p-3 text-sm" data-testid="title-confirm-new">
          <p className="mb-2">{t('title.confirmNew')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="title-confirm-new-yes"
              onClick={() => setPicking(true)}
              className="flex-1 rounded-full bg-rose-400 py-1.5 font-bold text-rose-950 hover:bg-rose-300"
            >
              {t('title.confirmNewYes')}
            </button>
            <button type="button" onClick={() => setConfirmNew(false)} className="flex-1 rounded-full bg-white/15 py-1.5 hover:bg-white/25">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="title-start"
          autoFocus={!hasSave}
          disabled={loading || save.status === 'checking'}
          onClick={onNew}
          className={`rounded-full py-2.5 text-lg font-bold shadow disabled:opacity-60 ${
            hasSave ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-amber-400 text-amber-950 hover:bg-amber-300'
          }`}
        >
          {t('title.newGame')}
        </button>
      )}
      {save.status === 'corrupt' && (
        <p data-testid="title-save-corrupt" role="status" className="rounded-xl bg-rose-500/30 p-3 text-sm leading-6">
          {t('save.corrupt')}
        </p>
      )}
    </div>
  );
}
