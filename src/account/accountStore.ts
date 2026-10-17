// 帳號狀態（任務 11G、11L-2、T-184）：Google、LINE 的 OAuth 登入、登出。第一次登入就自動建立並綁定帳號，沒有另外的註冊。
// 登入只用於線上模式（DECISIONS T-179）：線上資料存在資料庫，單機存檔不再同步到雲端。
// 登入後的玩家檔案與線上角色由 online/installOnline.ts 讀取。
import { create } from 'zustand';
import { supabase, accountEnabled } from './supabase';

export type AccountStatus = 'disabled' | 'signedOut' | 'signingIn' | 'signedIn';
export type LoginProvider = 'google' | 'line';

/** LINE 不是 Supabase 內建的登入方式，以自訂 OIDC 提供者設定（docs/multiplayer/accounts.md） */
const LINE_PROVIDER = (import.meta.env.VITE_SUPABASE_LINE_PROVIDER as string | undefined) ?? 'custom:line';

export type AccountState = {
  status: AccountStatus;
  email: string | null;
  userId: string | null;
  /** 正在登入的方式（等待瀏覽器頁面時顯示） */
  provider: LoginProvider | null;
  busy: boolean;
  /** 最後一次錯誤的 i18n key（或伺服器訊息） */
  error: string | null;
};

export const useAccountStore = create<AccountState>(() => ({
  status: accountEnabled ? 'signedOut' : 'disabled',
  email: null,
  userId: null,
  provider: null,
  busy: false,
  error: null,
}));

/** 監聽 Supabase 的登入狀態（頁面載入時會還原上次的登入；OAuth 換到登入狀態時也是由這裡切換成已登入） */
export function startAccountListener(): void {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    const prev = useAccountStore.getState();
    useAccountStore.setState({
      status: user ? 'signedIn' : prev.status === 'signingIn' ? 'signingIn' : 'signedOut',
      email: user?.email || null,
      userId: user?.id ?? null,
      provider: user ? null : prev.provider,
      busy: false,
    });
  });
  void completeWebRedirect();
}

/** 網頁版：從 Google / LINE 導回時網址帶著 code（或錯誤），換成登入狀態後把參數從網址拿掉 */
async function completeWebRedirect(): Promise<void> {
  if (!supabase || typeof window === 'undefined' || window.mistwood?.isElectron) return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (!code && !error) return;
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url.toString());
  await finish(code ? { code } : { error: error ?? undefined });
}

/** 以 code 換成登入狀態（onAuthStateChange 會切成 signedIn） */
async function finish(result: { code?: string; error?: string }): Promise<void> {
  if (!supabase) return;
  if (!result.code) {
    // 玩家自己取消不算錯誤
    const cancelled = result.error === 'cancelled' || result.error === 'access_denied';
    useAccountStore.setState({ status: 'signedOut', provider: null, busy: false, error: cancelled ? null : 'online.loginFailed' });
    return;
  }
  useAccountStore.setState({ status: 'signingIn', busy: true, error: null });
  const { error } = await supabase.auth.exchangeCodeForSession(result.code);
  if (error) useAccountStore.setState({ status: 'signedOut', provider: null, busy: false, error: 'online.loginFailed' });
}

/**
 * 用 Google 或 LINE 登入。網頁版直接導到登入頁、登入後導回同一頁；
 * 桌面版用系統瀏覽器登入，導回本機 127.0.0.1 由主程序收下 code（electron/oauthLoopback.ts）。
 */
export async function signInWith(provider: LoginProvider): Promise<void> {
  if (!supabase) return;
  const id = provider === 'line' ? (LINE_PROVIDER as `custom:${string}`) : 'google';
  const bridge = window.mistwood?.auth;
  useAccountStore.setState({ status: 'signingIn', provider, busy: true, error: null });
  if (!bridge) {
    const back = new URL(window.location.href);
    back.search = '';
    back.hash = '';
    const { error } = await supabase.auth.signInWithOAuth({ provider: id, options: { redirectTo: back.toString() } });
    if (error) useAccountStore.setState({ status: 'signedOut', provider: null, busy: false, error: 'online.loginFailed' });
    return;
  }
  const redirectTo = await bridge.redirect();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: id, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) {
    useAccountStore.setState({ status: 'signedOut', provider: null, busy: false, error: 'online.loginFailed' });
    return;
  }
  // 等待期間可以取消（busy 只在換登入狀態時才鎖住按鈕）
  useAccountStore.setState({ busy: false });
  await finish(await bridge.start(data.url));
}

/** 取消正在等待的登入（桌面版關掉主程序的等待；網頁版不會停在這個狀態） */
export function cancelSignIn(): void {
  void window.mistwood?.auth?.cancel();
  useAccountStore.setState({ status: 'signedOut', provider: null, busy: false, error: null });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  useAccountStore.setState({ status: 'signedOut', email: null, userId: null, provider: null, error: null });
}
