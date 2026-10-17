import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { worldClockAt } from '@/game-core/world/timeOfDay';
import { syncServerTime, worldClockNow } from '@/game/world/worldClock';
import { healthUrl, syncClockFromServer } from './serverTime';

describe('啟動時向遊戲伺服器對時（T-181）', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { search: '' } }));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    syncServerTime(Date.now());
  });

  it('ws / wss 位址換成 http / https 的健康檢查', () => {
    expect(healthUrl('wss://mistwood-server.yisoapp.com')).toBe('https://mistwood-server.yisoapp.com/health');
    expect(healthUrl('ws://localhost:2567')).toBe('http://localhost:2567/health');
  });

  it('沒有設定遊戲伺服器時不送請求', async () => {
    vi.stubEnv('VITE_GAME_SERVER_URL', '');
    const fetcher = vi.fn();
    expect(await syncClockFromServer(fetcher as unknown as typeof fetch)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('以伺服器回傳的時間校正世界時鐘（本機快了 10 分鐘也一樣）', async () => {
    vi.stubEnv('VITE_GAME_SERVER_URL', 'wss://game.example');
    const serverNow = Date.now() - 600_000;
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, now: serverNow })));
    expect(await syncClockFromServer(fetcher as unknown as typeof fetch)).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://game.example/health', { cache: 'no-store' });
    expect(Math.abs(worldClockNow() - worldClockAt(serverNow))).toBeLessThan(1);
  });

  it('伺服器沒有回傳時間或連不上時維持本機時鐘', async () => {
    vi.stubEnv('VITE_GAME_SERVER_URL', 'wss://game.example');
    const before = worldClockNow();
    expect(await syncClockFromServer((async () => new Response('{"ok":true}')) as unknown as typeof fetch)).toBe(false);
    expect(await syncClockFromServer((async () => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBe(false);
    expect(Math.abs(worldClockNow() - before)).toBeLessThan(1);
  });
});
