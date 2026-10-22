// 帳號驗證（任務 11M-7）：客戶端加入時帶上登入的 access token，伺服器向 Supabase 確認是哪個帳號。
// 同一個帳號同時只能在一處連線（後進的登入，先進的會被踢下線，見 WorldRoom）。
// 驗證用 Supabase 的 /auth/v1/user：有效的 token 回傳使用者，無效或過期就失敗；用 publishable key 呼叫，不需要 secret key。
// 環境變數 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY 沒有設定時不驗證（全部當作訪客，不會互相踢）。

/** 驗證 token，回傳帳號 id；無效時丟出錯誤 */
export type AccountVerifier = (token: string) => Promise<string>;

export function supabaseVerifier(url: string, publishableKey: string, fetchFn: typeof fetch = fetch): AccountVerifier {
  const base = url.replace(/\/+$/, '');
  return async (token) => {
    const res = await fetchFn(`${base}/auth/v1/user`, { headers: { apikey: publishableKey, authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Supabase 回應 ${res.status}`);
    const user = (await res.json()) as { id?: unknown };
    if (typeof user.id !== 'string' || user.id.length === 0) throw new Error('沒有帳號 id');
    return user.id;
  };
}

/** 依環境變數建立驗證器；沒有設定時回傳 null */
export function verifierFromEnv(env: NodeJS.ProcessEnv): AccountVerifier | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return supabaseVerifier(url, key);
}
