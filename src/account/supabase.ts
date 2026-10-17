// Supabase 客戶端（任務 11G）：只用 publishable key（公開，會打包進網頁與 Electron）。
// 沒有設定 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 時（本機開發、e2e 建置）帳號與線上功能停用，不影響單機遊玩。
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const accountEnabled = !!url && !!key;

/**
 * 登入狀態存在 localStorage（只有登入憑證，不是遊戲進度）。OAuth 用 PKCE（T-184）：導回時網址只帶一次性的 code，
 * 由 accountStore 換成登入狀態（不讓 Supabase 自動讀網址，桌面版的 code 是從主程序拿到的）。
 */
export const supabase: SupabaseClient<Database> | null = accountEnabled
  ? createClient<Database>(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } })
  : null;
