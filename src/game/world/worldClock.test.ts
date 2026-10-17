import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockAt, worldClockAt } from '@/game-core/world/timeOfDay';
import { serverTimeOffset } from '@/game-core/net/protocol';
import { debugAdvanceClockTo, resetDebugClock, syncServerTime, worldClockNow } from './worldClock';

describe('worldClock（共享日夜）', () => {
  afterEach(() => {
    resetDebugClock();
    syncServerTime(Date.now());
    vi.useRealTimers();
  });

  it('沒有連線時用本機的 Unix 時間', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 17, 9, 0, 0) });
    syncServerTime(Date.now());
    expect(worldClockNow()).toBeCloseTo(worldClockAt(Date.now()), 6);
  });

  it('收到伺服器時間後以伺服器為準：本機時鐘快了 10 分鐘也和大家一樣', () => {
    const server = Date.UTC(2026, 9, 17, 9, 0, 0);
    vi.useFakeTimers({ now: server + 10 * 60 * 1000 });
    syncServerTime(server);
    expect(worldClockNow()).toBeCloseTo(worldClockAt(server), 6);
  });

  it('對時扣掉一半的來回時間', () => {
    expect(serverTimeOffset({ t: 1000, now: 5100 }, 1200)).toBe(5100 - 1100);
  });

  it('除錯往前撥只影響本機，取消後回到共享時鐘', () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 17, 9, 0, 0) });
    syncServerTime(Date.now());
    debugAdvanceClockTo(22);
    expect(clockAt(worldClockNow())).toBeCloseTo(22, 5);
    resetDebugClock();
    expect(worldClockNow()).toBeCloseTo(worldClockAt(Date.now()), 6);
  });
});
