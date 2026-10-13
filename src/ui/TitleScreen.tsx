import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { QualitySelector } from './QualitySelector';

/** 主選單（規格 6.9）。背景是緩慢環繞的實際場景。 */
export function TitleScreen() {
  const screen = useGameStore((s) => s.screen);
  const send = useGameStore((s) => s.send);
  if (screen !== 'title') return null;
  return (
    <div
      data-testid="title-screen"
      className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-sky-900/10 via-transparent to-emerald-950/45"
    >
      <div className="rounded-3xl bg-slate-900/25 px-12 py-6 backdrop-blur-[2px]">
        <h1 className="text-center text-6xl font-black tracking-wider text-white drop-shadow-[0_4px_12px_rgba(20,60,90,0.55)]">
          {t('app.title')}
        </h1>
        <p className="mt-3 text-center text-lg text-white/90 drop-shadow">{t('title.subtitle')}</p>
      </div>
      <div className="mt-12 flex w-72 flex-col gap-3 rounded-2xl bg-black/35 p-5 text-white backdrop-blur-sm">
        <button
          type="button"
          data-testid="title-start"
          autoFocus
          onClick={() => send('startGame')}
          className="rounded-full bg-amber-400 py-2.5 text-lg font-bold text-amber-950 shadow hover:bg-amber-300"
        >
          {t('title.start')}
        </button>
        <div className="mt-1 text-sm">
          <span className="mb-1 block px-1 opacity-80">{t('settings.quality')}</span>
          <QualitySelector className="text-sm" />
        </div>
        <button
          type="button"
          data-testid="title-quit"
          onClick={() => window.close()}
          className="mt-1 rounded-full bg-white/15 py-2 hover:bg-white/25"
        >
          {t('title.quit')}
        </button>
      </div>
    </div>
  );
}
