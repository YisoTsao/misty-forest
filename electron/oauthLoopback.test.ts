import { afterEach, describe, expect, it } from 'vitest';
import { cancelCallback, isAllowedAuthUrl, LOOPBACK_REDIRECT, parseCallback, waitForCallback } from './oauthLoopback';

describe('桌面版 OAuth 迴路（T-184）', () => {
  afterEach(() => cancelCallback());

  it('回呼網址取出 code；錯誤時取出說明；其他路徑不理會', () => {
    expect(parseCallback('/auth/callback?code=abc')).toEqual({ code: 'abc' });
    expect(parseCallback('/auth/callback?error=access_denied&error_description=user%20denied')).toEqual({ error: 'user denied' });
    expect(parseCallback('/auth/callback')).toEqual({ error: 'missing code' });
    expect(parseCallback('/favicon.ico')).toBeNull();
  });

  it('只允許打開 https 的 Supabase 登入網址', () => {
    expect(isAllowedAuthUrl('https://x.supabase.co/auth/v1/authorize?provider=google', null)).toBe(true);
    expect(isAllowedAuthUrl('https://x.supabase.co/auth/v1/authorize?provider=google', 'x.supabase.co')).toBe(true);
    expect(isAllowedAuthUrl('https://evil.example/auth/v1/authorize', 'x.supabase.co')).toBe(false);
    expect(isAllowedAuthUrl('http://x.supabase.co/auth/v1/authorize', null)).toBe(false);
    expect(isAllowedAuthUrl('file:///etc/passwd', null)).toBe(false);
    expect(isAllowedAuthUrl('https://x.supabase.co/rest/v1/profiles', null)).toBe(false);
    expect(isAllowedAuthUrl('不是網址', null)).toBe(false);
  });

  it('瀏覽器導回 127.0.0.1 時收下 code，並回一個完成頁面', async () => {
    const result = waitForCallback();
    await new Promise((r) => setTimeout(r, 50));
    const res = await fetch(`${LOOPBACK_REDIRECT}?code=xyz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('登入完成');
    await expect(result).resolves.toEqual({ code: 'xyz' });
  });

  it('取消時以 cancelled 結束；重新開始會取消上一次', async () => {
    const first = waitForCallback();
    const second = waitForCallback();
    await expect(first).resolves.toEqual({ error: 'cancelled' });
    // 上一次關閉後仍能在同一個埠號收到回呼
    await new Promise((r) => setTimeout(r, 50));
    await fetch(`${LOOPBACK_REDIRECT}?code=again`);
    await expect(second).resolves.toEqual({ code: 'again' });
  });
});
