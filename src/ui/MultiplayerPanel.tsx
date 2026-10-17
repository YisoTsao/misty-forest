import { useEffect, useState } from 'react';
import { NET } from '@/game-core/net/protocol';
import { t } from '@/game/i18n';
import { useGameStore } from '@/game/state/gameStore';
import { useUiStore } from '@/game/state/uiStore';
import { savedName, serverUrl } from '@/net/config';
import { connect, connectionName, disconnect, reconnect } from '@/net/netClient';
import { useNetStore } from '@/net/netStore';
import { useOnlineStore } from '@/online/onlineStore';

/**
 * 多人連線面板（任務 11A，從暫停選單開啟）：顯示名稱、伺服器位址、連線 / 中斷 / 重新連線、房間內的人。
 * 線上模式（任務 11L-2）用帳號的顯示名稱、不能修改；沒有設定帳號服務的開發建置可以自訂名稱。
 * 伺服器位址由建置設定或網址參數 ?server= 決定，這裡只顯示。
 */
export function MultiplayerPanel() {
  const open = useUiStore((s) => s.multiplayerOpen);
  const screen = useGameStore((s) => s.screen);
  useEffect(() => {
    if (screen === 'playing' || screen === 'title') useUiStore.getState().setMultiplayerOpen(false);
  }, [screen]);
  if (!open) return null;
  return <MultiplayerWindow />;
}

function MultiplayerWindow() {
  const { status, members, playerCount, error, serverUrl: connectedUrl } = useNetStore();
  const onlineName = useOnlineStore((s) => (s.mode === 'online' ? (s.profile?.displayName ?? null) : null));
  const [customName, setName] = useState(() => savedName() || connectionName());
  const name = onlineName ?? customName;
  const close = () => useUiStore.getState().setMultiplayerOpen(false);
  const busy = status === 'connecting';

  useEffect(() => {
    // capture 階段：面板開著時按鍵不傳給暫停選單與遊戲輸入（輸入框照常打字）
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.code === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-labelledby="mp-title"
        data-testid="multiplayer-panel"
        data-pad-scope
        className="flex w-[min(94vw,24rem)] flex-col gap-3 rounded-2xl bg-slate-900 p-6 text-sm text-white shadow-2xl"
      >
        <h2 id="mp-title" className="text-center text-2xl font-bold">
          {t('net.title')}
        </h2>
        <p className="text-xs opacity-70">{t('net.intro')}</p>
        <label className="flex flex-col gap-1">
          <span className="opacity-80">{t('net.name')}</span>
          <input
            data-testid="mp-name"
            value={name}
            maxLength={NET.nameMaxLength}
            disabled={onlineName !== null || (status !== 'offline' && status !== 'error')}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg bg-white/10 px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
          />
        </label>
        <div className="flex flex-col gap-0.5">
          <span className="opacity-80">{t('net.server')}</span>
          <code className="truncate rounded bg-black/30 px-2 py-1 text-xs">{connectedUrl || serverUrl()}</code>
        </div>
        <p data-testid="mp-status" className="text-center">
          {t(`net.status.${status}`)}
          {status === 'connected' && ` · ${t('net.players', { count: playerCount })}`}
        </p>
        {error && status === 'error' && <p className="text-center text-xs text-rose-300">{error}</p>}
        {status === 'connected' && (
          <ul data-testid="mp-members" className="max-h-32 overflow-y-auto rounded-lg bg-black/25 px-3 py-2 text-xs">
            <li className="opacity-70">{t('net.you', { name: connectionName() })}</li>
            {members.map((m) => (
              <li key={m.sessionId} className={m.online ? '' : 'opacity-50'}>
                {m.online ? m.name : `${m.name} ${t('net.remoteUnstable')}`}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {status === 'connected' || status === 'reconnecting' ? (
            <button type="button" data-testid="mp-disconnect" onClick={() => void disconnect()} className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25">
              {t('net.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              data-testid="mp-connect"
              disabled={busy}
              onClick={() => void (status === 'error' ? reconnect({ name }) : connect({ name }))}
              className="flex-1 rounded-full bg-amber-400 py-2 font-bold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
            >
              {t(status === 'error' ? 'net.reconnect' : 'net.connect')}
            </button>
          )}
          <button type="button" data-testid="mp-close" onClick={close} className="flex-1 rounded-full bg-white/15 py-2 hover:bg-white/25">
            {t('net.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
