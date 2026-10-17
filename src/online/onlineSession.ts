// 線上遊玩紀錄（任務 11L-2）：進入線上世界時在 player_sessions 建立一筆，遊玩中每分鐘更新 last_seen_at，
// 回到標題或關閉視窗時寫入 ended_at。後台用來統計活躍人數；失敗只記錄，不影響遊玩。
import type { Database } from '@/account/database.types';
import { supabase } from '@/account/supabase';

const HEARTBEAT_MS = 60_000;

let sessionId: number | null = null;
let heartbeat: number | null = null;

function client(): Database['public']['Tables']['player_sessions']['Insert']['client'] {
  return window.mistwood?.isElectron ? 'electron' : 'web';
}

export async function startOnlineSession(): Promise<void> {
  if (!supabase) return;
  await endOnlineSession();
  const { data, error } = await supabase
    .from('player_sessions')
    .insert({ client: client(), app_version: import.meta.env.VITE_APP_VERSION ?? null })
    .select('id')
    .single();
  if (error) {
    console.warn('[online] 建立遊玩紀錄失敗：', error.message);
    return;
  }
  sessionId = data.id;
  heartbeat = window.setInterval(() => void touch({ last_seen_at: new Date().toISOString() }), HEARTBEAT_MS);
}

export async function endOnlineSession(): Promise<void> {
  if (heartbeat !== null) window.clearInterval(heartbeat);
  heartbeat = null;
  if (sessionId === null) return;
  const now = new Date().toISOString();
  await touch({ last_seen_at: now, ended_at: now });
  sessionId = null;
}

async function touch(fields: { last_seen_at: string; ended_at?: string }): Promise<void> {
  if (!supabase || sessionId === null) return;
  const { error } = await supabase.from('player_sessions').update(fields).eq('id', sessionId);
  if (error) console.warn('[online] 更新遊玩紀錄失敗：', error.message);
}

/** 關閉視窗時盡量寫入結束時間（不保證送達；沒寫到的由 last_seen_at 判斷） */
export function endOnlineSessionOnPageHide(): void {
  window.addEventListener('pagehide', () => void endOnlineSession());
}
