// 啟動時向遊戲伺服器對時（共享日光，T-181）：單機遊玩也用伺服器的時間算日夜，
// 本機時鐘不準的裝置也和其他人看到同一個時刻。連上遊戲伺服器後改由 time 訊息持續校正（netClient）。
// 沒有設定遊戲伺服器（本機開發、e2e 建置）時不送請求，直接用本機時鐘。
import { serverTimeOffset } from '@/game-core/net/protocol';
import { syncServerTime } from '@/game/world/worldClock';
import { serverUrl } from './config';

/** 來回超過這麼久就不準（伺服器剛被喚醒），再問一次 */
const MAX_RTT_MS = 3000;

/** 遊戲伺服器的健康檢查網址（ws → http、wss → https） */
export function healthUrl(server: string): string {
  const u = new URL(server);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  u.pathname = '/health';
  u.search = '';
  return u.toString();
}

async function askOnce(url: string, fetcher: typeof fetch): Promise<{ offset: number; rtt: number } | null> {
  const sent = Date.now();
  const res = await fetcher(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const body = (await res.json()) as { now?: unknown };
  const received = Date.now();
  if (typeof body.now !== 'number' || !Number.isFinite(body.now)) return null;
  return { offset: serverTimeOffset({ t: sent, now: body.now }, received), rtt: received - sent };
}

/** 對時一次；回傳是否成功（失敗時維持本機時鐘，不影響遊玩） */
export async function syncClockFromServer(fetcher: typeof fetch = fetch): Promise<boolean> {
  const configured = !!import.meta.env.VITE_GAME_SERVER_URL || new URLSearchParams(window.location.search).has('server');
  if (!configured) return false;
  try {
    const url = healthUrl(serverUrl());
    let result = await askOnce(url, fetcher);
    if (result && result.rtt > MAX_RTT_MS) result = (await askOnce(url, fetcher)) ?? result;
    if (!result) return false;
    syncServerTime(Date.now() + result.offset);
    return true;
  } catch {
    return false;
  }
}
