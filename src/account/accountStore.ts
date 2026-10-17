// 帳號狀態（任務 11G、11L-2）：Email 驗證碼登入、登出。
// 登入只用於線上模式（DECISIONS T-179）：線上資料存在資料庫，單機存檔不再同步到雲端。
// 登入後的玩家檔案與線上角色由 online/installOnline.ts 讀取。
import { create } from 'zustand';
import { supabase, accountEnabled } from './supabase';

export type AccountStatus = 'disabled' | 'signedOut' | 'codeSent' | 'signedIn';

export type AccountState = {
  status: AccountStatus;
  email: string | null;
  userId: string | null;
  /** 寄出驗證碼的信箱（輸入驗證碼時顯示） */
  pendingEmail: string | null;
  busy: boolean;
  /** 最後一次錯誤的 i18n key（或伺服器訊息） */
  error: string | null;
};

export const useAccountStore = create<AccountState>(() => ({
  status: accountEnabled ? 'signedOut' : 'disabled',
  email: null,
  userId: null,
  pendingEmail: null,
  busy: false,
  error: null,
}));

/** 監聽 Supabase 的登入狀態（頁面載入時會還原上次的登入；驗證碼通過時也是由這裡切換成已登入） */
export function startAccountListener(): void {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ?? null;
    const prev = useAccountStore.getState();
    useAccountStore.setState({
      status: user ? 'signedIn' : prev.status === 'codeSent' ? 'codeSent' : 'signedOut',
      email: user?.email ?? null,
      userId: user?.id ?? null,
      busy: false,
    });
  });
}

/** 寄出驗證碼。信箱不存在時 Supabase 會自動建立帳號（shouldCreateUser）。 */
export async function sendCode(email: string): Promise<boolean> {
  if (!supabase) return false;
  const address = email.trim().toLowerCase();
  useAccountStore.setState({ busy: true, error: null });
  const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
  if (error) {
    useAccountStore.setState({ busy: false, error: error.message });
    return false;
  }
  useAccountStore.setState({ busy: false, status: 'codeSent', pendingEmail: address });
  return true;
}

/** 驗證碼正確時 Supabase 建立登入狀態，onAuthStateChange 會把狀態切成 signedIn（不需要再按任何按鈕） */
export async function verifyCode(code: string): Promise<boolean> {
  const email = useAccountStore.getState().pendingEmail;
  if (!supabase || !email) return false;
  useAccountStore.setState({ busy: true, error: null });
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) {
    useAccountStore.setState({ busy: false, error: error.message });
    return false;
  }
  useAccountStore.setState({ pendingEmail: null });
  return true;
}

/** 回到輸入信箱（重寄或換信箱） */
export function backToEmail(): void {
  useAccountStore.setState({ status: 'signedOut', pendingEmail: null, error: null });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  useAccountStore.setState({ status: 'signedOut', email: null, userId: null, error: null });
}
