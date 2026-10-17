// 共享世界時鐘的本機來源（使用者 2026-10-17：所有玩家看到同一個日夜）。
// 預設用本機的 Unix 時間；連上遊戲伺服器後改用伺服器時間（加上收到的時差），本機時鐘不準的人也和大家一致。
// 除錯的「設定時刻」只在本機往前撥（偏移累加），不影響其他人。
import { secondsUntilHour, worldClockAt } from '@/game-core/world/timeOfDay';

const source = {
  /** 伺服器時間 − 本機時間（毫秒）；沒有連線時為 0 */
  serverOffsetMs: 0,
  /** 除錯往前撥的秒數 */
  debugShift: 0,
};

/** 現在的共享世界時鐘（秒，GameState.clock 的值） */
export function worldClockNow(): number {
  return worldClockAt(Date.now() + source.serverOffsetMs) + source.debugShift;
}

/** 收到伺服器時間（毫秒）時呼叫：之後以伺服器時間為準 */
export function syncServerTime(serverNowMs: number, localNowMs = Date.now()): void {
  source.serverOffsetMs = serverNowMs - localNowMs;
}

/** 除錯：本機的時鐘往前撥到下一個 hour 時刻；回傳撥了幾秒（權威層的 DebugSetClock 會撥同樣多） */
export function debugAdvanceClockTo(hour: number): number {
  const dt = secondsUntilHour(worldClockNow(), hour);
  source.debugShift += dt;
  return dt;
}

/** 除錯：取消往前撥，回到共享時鐘 */
export function resetDebugClock(): void {
  source.debugShift = 0;
}

/** 除錯面板與 debugApi 的「設定時刻」：先對時，再讓本機時鐘與權威層一起往前撥到 hour */
export function debugSetClock(send: (command: { type: 'SyncClock'; clock: number } | { type: 'DebugSetClock'; hour: number }) => void, hour: number): void {
  const h = ((hour % 24) + 24) % 24;
  send({ type: 'SyncClock', clock: worldClockNow() });
  debugAdvanceClockTo(h);
  send({ type: 'DebugSetClock', hour: h });
}
