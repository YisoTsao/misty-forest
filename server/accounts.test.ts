import { describe, expect, it } from 'vitest';
import { supabaseVerifier, verifierFromEnv } from './accounts';

describe('帳號驗證（任務 11M-7）', () => {
  it('用 access token 呼叫 /auth/v1/user，回傳使用者 id', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    }) as typeof fetch;
    const verify = supabaseVerifier('https://example.supabase.co/', 'pk_test', fetchFn);
    await expect(verify('tok')).resolves.toBe('user-1');
    expect(calls[0]!.url).toBe('https://example.supabase.co/auth/v1/user');
    expect(calls[0]!.headers).toEqual({ apikey: 'pk_test', authorization: 'Bearer tok' });
  });

  it('token 無效（401）或沒有 id：丟出錯誤，不當作訪客', async () => {
    const bad = supabaseVerifier('https://x.supabase.co', 'k', (async () => new Response('no', { status: 401 })) as typeof fetch);
    await expect(bad('tok')).rejects.toThrow('401');
    const noId = supabaseVerifier('https://x.supabase.co', 'k', (async () => new Response('{}', { status: 200 })) as typeof fetch);
    await expect(noId('tok')).rejects.toThrow('沒有帳號 id');
  });

  it('環境變數沒有設定時不驗證（回傳 null）', () => {
    expect(verifierFromEnv({})).toBeNull();
    expect(verifierFromEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(verifierFromEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'k' })).not.toBeNull();
  });
});
