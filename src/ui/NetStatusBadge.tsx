import { t } from '@/game/i18n';
import { debugEnabled } from '@/game/debugApi';
import { useGameStore } from '@/game/state/gameStore';
import { reconnect } from '@/net/netClient';
import { useNetStore } from '@/net/netStore';

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
