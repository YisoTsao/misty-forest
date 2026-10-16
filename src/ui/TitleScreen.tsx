import { useState } from 'react';
import { t } from '@/game/i18n';
import { continueGame, startNewGame } from '@/game/session';
import { useGameStore } from '@/game/state/gameStore';
import { useSaveStore } from '@/game/state/saveStore';
import { useUiStore } from '@/game/state/uiStore';
import { formatPlayTime, formatSavedAt } from './saveFormat';

/** 主選單（規格 6.9）：繼續遊戲、新遊戲、畫質、離開。背景是緩慢環繞的實際場景。 */
export function TitleScreen() {
  const screen = useGameStore((s) => s.screen);
  if (screen !== 'title') return null;
  return <TitleMenu />;
}

function TitleMenu() {
  const save = useSaveStore((s) => s.mainSave);
  const [confirmNew, setConfirmNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const hasSave = save.status === 'ok' || save.status === 'restored-from-backup';

  const onContinue = async () => {
    setLoading(true);
    const ok = await continueGame();
    // 成功時主選單已卸載；失敗時存檔狀態已更新為損壞，畫面會顯示原因
    if (!ok) setLoading(false);
  };
  const onNew = () => {
    if (hasSave && !confirmNew) setConfirmNew(true);
    else startNewGame();
  };

  return (
    <div
      data-testid="title-screen" data-pad-scope
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-sky-900/10 via-transparent to-emerald-950/45"
    >
      <div className="rounded-3xl bg-slate-900/25 px-12 py-6 backdrop-blur-[2px]">
        <h1 className="text-center text-6xl font-black tracking-wider text-white drop-shadow-[0_4px_12px_rgba(20,60,90,0.55)]">
          {t('app.title')}
        </h1>
        <p className="mt-3 text-center text-lg text-white/90 drop-shadow">{t('title.subtitle')}</p>
      </div>
      <div className="mt-12 flex w-80 flex-col gap-3 rounded-2xl bg-black/35 p-5 text-white backdrop-blur-sm">
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
                onClick={startNewGame}
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
        <button type="button" data-testid="title-account" onClick={() => useUiStore.getState().setAccountOpen(true)} className="rounded-full bg-white/15 py-2 hover:bg-white/25">
          {t('account.open')}
        </button>
        <button
          type="button"
          data-testid="title-settings"
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
          className="rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('settings.open')}
        </button>
        <button type="button" data-testid="title-quit" onClick={() => window.close()} className="mt-1 rounded-full bg-white/15 py-2 hover:bg-white/25">
          {t('title.quit')}
        </button>
      </div>
    </div>
  );
}
