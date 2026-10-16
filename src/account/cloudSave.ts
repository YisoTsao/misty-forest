// 雲端存檔的讀寫（任務 11G）：表 public.saves，每個帳號一列，資料表由 RLS 限制只能讀寫自己的列。
// 只負責搬運；比對與套用結果在 sync.ts。
import { supabase } from './supabase';
import { useAccountStore } from './accountStore';

export type CloudSave = { data: unknown; savedAt: string };

function currentUserId(): string | null {
  return useAccountStore.getState().userId;
}

export async function fetchCloudSave(): Promise<CloudSave | null> {
  const userId = currentUserId();
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('saves').select('data, saved_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { data: data.data, savedAt: data.saved_at };
}

export async function uploadCloudSave(data: unknown, savedAt: string): Promise<void> {
  const userId = currentUserId();
  if (!supabase || !userId) throw new Error('未登入');
  const { error } = await supabase.from('saves').upsert({ user_id: userId, data, saved_at: savedAt }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/**
 * 每次本機存檔後把同一份內容上傳（依序排隊，失敗只記錄錯誤、不影響本機存檔）。
 * 未登入時什麼都不做。
 */
let chain: Promise<void> = Promise.resolve();
export function mirrorToCloud(data: { savedAt: string }): void {
  if (!supabase || useAccountStore.getState().status !== 'signedIn') return;
  chain = chain
    .then(() => uploadCloudSave(data, data.savedAt))
    .then(() => useAccountStore.setState({ error: null }))
    .catch((err: unknown) => {
      console.error('[account] 雲端存檔失敗：', err);
      useAccountStore.setState({ error: 'account.syncFailed' });
    });
}
