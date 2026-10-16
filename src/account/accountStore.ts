// 帳號狀態（任務 11G）：Email 驗證碼登入、登出、登入後的存檔同步。
// 登入只在標題畫面進行：遊戲中下載雲端存檔會與正在進行的進度衝突（見 DECISIONS T-178）。
import { create } from 'zustand';
import { planSync, type SyncPlan, type SyncSide } from '@/game-core/save/sync';
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
  /** 同步的結果：本機與雲端都有、而且不同版時等玩家選擇 */
  conflict: Extract<SyncPlan, { kind: 'conflict' }> | null;
  /** 這次開啟網頁後是否已經同步過（避免每次開標題都比對） */
  synced: boolean;
};

export const useAccountStore = create<AccountState>(() => ({
  status: accountEnabled ? 'signedOut' : 'disabled',
  email: null,
  userId: null,
  pendingEmail: null,
  busy: false,
  error: null,
  conflict: null,
  synced: false,
}));

/** 監聽 Supabase 的登入狀態（頁面載入時會還原上次的登入） */
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

/** 寄出 6 位數驗證碼。信箱不存在時 Supabase 會自動建立帳號（shouldCreateUser）。 */
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

export async function verifyCode(code: string): Promise<boolean> {
  const email = useAccountStore.getState().pendingEmail;
  if (!supabase || !email) return false;
  useAccountStore.setState({ busy: true, error: null });
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) {
    useAccountStore.setState({ busy: false, error: error.message });
    return false;
  }
  useAccountStore.setState({ pendingEmail: null, synced: false });
  return true;
}

/** 回到輸入信箱（重寄或換信箱） */
export function backToEmail(): void {
  useAccountStore.setState({ status: 'signedOut', pendingEmail: null, error: null });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  useAccountStore.setState({ status: 'signedOut', email: null, userId: null, conflict: null, synced: false });
}

/** 把同步計畫套用到本機：上傳本機、下載雲端，或只是記錄為已同步 */
export function sideOf(raw: unknown): SyncSide {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { savedAt?: unknown; world?: { time?: unknown } };
  if (typeof data.savedAt !== 'string') return null;
  return { savedAt: data.savedAt, playTime: typeof data.world?.time === 'number' ? data.world.time : 0 };
}

export { planSync };
