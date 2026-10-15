import { useEffect, useState } from 'react';
import { t } from '@/game/i18n';
import { debugEnabled } from '@/game/debugApi';
import { useGameStore } from '@/game/state/gameStore';
import { reconnect } from '@/net/netClient';
import { useNetStore } from '@/net/netStore';

/** 連線中超過這麼久就提示伺服器可能在休眠中喚醒（Render 免費方案閒置 15 分鐘會休眠，任務 11D） */
const WAKE_HINT_MS = 4000;

const DOT: Record<string, string> = {
  connecting: 'bg-amber-300 animate-pulse',
  reconnecting: 'bg-amber-300 animate-pulse',
  connected: 'bg-emerald-400',
  error: 'bg-rose-400',
};

/** 小地圖下方的連線狀態（任務 11A、11C）：狀態、房間人數、自動重新連線中、放棄後的斷線原因與「重新連線」。沒有使用多人時不顯示。 */
export function NetStatusBadge() {
  const { status, playerCount, error } = useNetStore();
  const onTitle = useGameStore((s) => s.screen === 'title');
  const waiting = status === 'connecting' || status === 'reconnecting';
  if (status === 'offline' || onTitle) return null;
  return (
    <div
      data-testid="net-status"
      data-status={status}
      className={`absolute top-[232px] flex max-w-56 flex-col items-end gap-1 text-xs text-white ${debugEnabled ? 'right-48' : 'right-5'}`}
    >
      <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 font-bold shadow">
        <span className={`h-2 w-2 rounded-full ${DOT[status] ?? 'bg-white'}`} />
        <span>{t(`net.status.${status}`)}</span>
        {status === 'connected' && <span data-testid="net-count">{t('net.players', { count: playerCount })}</span>}
      </div>
      {waiting && <WakeHint />}
      {status === 'error' && (
        <div className="flex flex-col items-end gap-1">
          {error && <span data-testid="net-error" className="rounded bg-black/50 px-2 py-0.5 text-right text-rose-200">{error}</span>}
          <button
            type="button"
            data-testid="net-reconnect"
            onClick={() => void reconnect()}
            className="rounded-full bg-amber-400 px-3 py-1 font-bold text-amber-950 shadow hover:bg-amber-300"
          >
            {t('net.reconnect')}
          </button>
        </div>
      )}
    </div>
  );
}

/** 等待連線超過 WAKE_HINT_MS 才出現；只在等待時掛上，每次開始等待都重新計時 */
function WakeHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), WAKE_HINT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return null;
  return (
    <span data-testid="net-wake-hint" className="rounded bg-black/50 px-2 py-0.5 text-right text-amber-100">
      {t('net.wakeHint')}
    </span>
  );
}
