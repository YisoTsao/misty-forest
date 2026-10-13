import { useEffect, useState } from 'react';
import { rebindableActions, type ActionId } from '@/game-core/input/actions';
import { t } from '@/game/i18n';
import { keyLabel, padLabel } from '@/game/input/keyLabels';
import padBindings from '@/data/gamepad.json';
import { useGameStore } from '@/game/state/gameStore';
import { useSettingsStore } from '@/game/state/settingsStore';
import { useUiStore } from '@/game/state/uiStore';
import { QualitySelector } from './QualitySelector';

type Listening = { action: ActionId; slot: 0 | 1 };

/** 音量（規格 6.9：設定含音量）：主音量、音樂、音效（含環境音） */
function VolumeSliders() {
  const volumes = useSettingsStore((s) => s.volumes);
  const setVolume = useSettingsStore((s) => s.setVolume);
  return (
    <section className="text-sm">
      <h3 className="mb-1 px-1 font-bold opacity-80">{t('settings.volume')}</h3>
      <div className="flex flex-col gap-1.5 px-1">
        {(['master', 'music', 'sfx'] as const).map((channel) => (
          <label key={channel} className="flex items-center gap-3">
            <span className="w-14 shrink-0 opacity-80">{t(`settings.volume.${channel}`)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volumes[channel]}
              data-testid={`volume-${channel}`}
              onChange={(e) => setVolume(channel, Number(e.target.value))}
              className="flex-1 accent-amber-400"
            />
            <span className="w-10 text-right font-mono text-xs">{Math.round(volumes[channel] * 100)}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * 設定畫面（規格 6.9）：畫質與按鍵重新配置。從主選單或暫停選單開啟，Esc 或「完成」關閉。
 * 音量於 Phase 5 加入音效時一起提供。
 */
export function SettingsPanel() {
  const open = useUiStore((s) => s.settingsOpen);
  const screen = useGameStore((s) => s.screen);
  // 回到遊玩（或開始遊戲）時一定關閉
  useEffect(() => {
    if (screen === 'playing') useUiStore.getState().setSettingsOpen(false);
  }, [screen]);
  if (!open) return null;
  return <SettingsWindow />;
}

function SettingsWindow() {
  const bindings = useSettingsStore((s) => s.bindings);
  const setBinding = useSettingsStore((s) => s.setBinding);
  const resetBindings = useSettingsStore((s) => s.resetBindings);
  const [listening, setListening] = useState<Listening | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => useUiStore.getState().setSettingsOpen(false);

  useEffect(() => {
    // capture 階段：設定畫面開啟時，按鍵不再傳給暫停選單與遊戲輸入
    const assign = (code: string | null) => {
      if (!listening) return;
      const result = setBinding(listening.action, listening.slot, code);
      setListening(null);
      if ('error' in result) {
        setNotice(t(result.error === 'reserved' ? 'settings.reserved' : 'settings.lastKey'));
      } else if (result.displaced.length > 0 && code) {
        setNotice(t('settings.displaced', { key: keyLabel(code), actions: result.displaced.map((a) => t(`action.${a}`)).join('、') }));
      } else {
        setNotice(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.repeat) return;
      e.preventDefault();
      if (!listening) {
        if (e.code === 'Escape') close();
        return;
      }
      if (e.code === 'Escape') setListening(null);
      else if (/^Pad\d+$/.test(e.code)) return; // 手把按鈕不能指定給鍵盤動作（手把為固定配置）
      else if (e.code === 'Backspace') assign(null);
      else assign(e.code);
    };
    const onMouse = (e: MouseEvent) => {
      if (!listening) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      assign(`Mouse${e.button}`);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }, [listening, setBinding]);

  const anyUnbound = rebindableActions.some((a) => bindings[a].length === 0);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40" onContextMenu={(e) => e.preventDefault()}>
      <div
        role="dialog"
        aria-labelledby="settings-title"
        data-testid="settings" data-pad-scope
        className="flex max-h-[92vh] w-[min(94vw,34rem)] flex-col gap-4 overflow-y-auto rounded-2xl bg-slate-900 p-6 text-white shadow-2xl"
      >
        <h2 id="settings-title" className="text-center text-2xl font-bold">
          {t('settings.title')}
        </h2>
        <section className="text-sm">
          <h3 className="mb-1 px-1 font-bold opacity-80">{t('settings.quality')}</h3>
          <QualitySelector />
        </section>
        <VolumeSliders />
        <section className="text-sm">
          <div className="mb-1 flex items-end justify-between px-1">
            <h3 className="font-bold opacity-80">{t('settings.keys')}</h3>
            <button type="button" data-testid="settings-reset-keys" onClick={() => { resetBindings(); setNotice(null); }} className="rounded-full bg-white/10 px-3 py-0.5 text-xs hover:bg-white/20">
              {t('settings.resetKeys')}
            </button>
          </div>
          <table className="w-full border-separate border-spacing-y-1">
            <thead>
              <tr className="text-xs opacity-60">
                <th />
                <th className="font-normal">{t('settings.primary')}</th>
                <th className="font-normal">{t('settings.secondary')}</th>
              </tr>
            </thead>
            <tbody>
              {rebindableActions.map((action) => (
                <tr key={action}>
                  <td className="pr-2">{t(`action.${action}`)}</td>
                  {([0, 1] as const).map((slot) => {
                    const code = bindings[action][slot];
                    const active = listening?.action === action && listening.slot === slot;
                    return (
                      <td key={slot} className="w-36">
                        <button
                          type="button"
                          data-testid={`bind-${action}-${slot}`}
                          onClick={() => { setListening({ action, slot }); setNotice(null); }}
                          className={`w-full rounded-lg px-2 py-1 ${active ? 'animate-pulse bg-amber-400 text-amber-950' : 'bg-white/10 hover:bg-white/20'} ${!code && !active ? 'opacity-50' : ''}`}
                        >
                          {active ? t('settings.listening') : code ? keyLabel(code) : '—'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 px-1 text-xs opacity-60">{listening ? t('settings.listeningHint') : t('settings.pauseFixed')}</p>
          {(notice || anyUnbound) && (
            <p data-testid="settings-notice" role="status" className="mt-2 rounded-lg bg-amber-500/25 px-3 py-2 text-xs leading-5">
              {notice ?? t('settings.unboundWarning')}
            </p>
          )}
        </section>
        <GamepadLayout />
        <button type="button" data-testid="settings-close" onClick={close} className="rounded-full bg-amber-400 py-2 font-bold text-amber-950 hover:bg-amber-300">
          {t('settings.close')}
        </button>
      </div>
    </div>
  );
}

/** 手把配置（固定，不開放修改）：按鈕 → 動作 */
function GamepadLayout() {
  const rows = rebindableActions.flatMap((action) => {
    const buttons = (padBindings as Partial<Record<ActionId, number[]>>)[action];
    return buttons?.length ? [{ action, label: buttons.map(padLabel).join(' / ') }] : [];
  });
  return (
    <section className="text-sm" data-testid="settings-gamepad">
      <h3 className="mb-1 px-1 font-bold opacity-80">{t('settings.gamepad')}</h3>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 px-1">
        <li className="flex justify-between gap-2">
          <span>{t('settings.gamepad.move')}</span>
          <span className="opacity-80">{t('key.padStick')}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>{t('settings.gamepad.look')}</span>
          <span className="opacity-80">{t('key.padRightStick')}</span>
        </li>
        {rows.map((r) => (
          <li key={r.action} className="flex justify-between gap-2">
            <span>{t(`action.${r.action}`)}</span>
            <span className="opacity-80">{r.label}</span>
          </li>
        ))}
        <li className="flex justify-between gap-2">
          <span>{t('settings.gamepad.pause')}</span>
          <span className="opacity-80">Menu</span>
        </li>
      </ul>
      <p className="mt-1 px-1 text-xs opacity-60">{t('settings.gamepad.hint')}</p>
    </section>
  );
}
