// 線上模式的狀態（任務 11L-2，DECISIONS T-179）：線上一定要登入、資料只存在資料庫；單機只用本機存檔。
// 這裡負責：遊戲設定（維護模式）、玩家檔案（顯示名稱、角色、停權）、線上角色的讀寫（characters，以 revision 防止互相覆蓋）。
import { create } from 'zustand';
import chatBlocklist from '@/data/chatBlocklist.json';
import { ChatFilter } from '@/game-core/net/chat';
import { checkDisplayName, type OnlineConfig, type OnlineProfile, type OnlineRole } from '@/game-core/online/rules';
import type { SaveData } from '@/game-core/save/schema';
import { useAccountStore } from '@/account/accountStore';
import type { Json } from '@/account/database.types';
import { supabase } from '@/account/supabase';
import { useUiStore } from '@/game/state/uiStore';

/** 線上角色目前只用第 1 格（資料表預留到 3） */
const CHARACTER_SLOT = 1;
const NAME_FILTER = new ChatFilter(chatBlocklist.words);

/** 線上角色的摘要（標題畫面顯示與存檔時的版本比對；完整存檔只在進入時讀取） */
export type CharacterMeta = { id: string; revision: number; savedAt: string; playTime: number };

export type PlayMode = 'offline' | 'online';

type OnlineState = {
  /** 目前這一局是單機還是線上（標題畫面時為 offline） */
  mode: PlayMode;
  config: (OnlineConfig & { motd: string | null }) | null;
  profile: OnlineProfile | null;
  /** undefined：還沒讀取；null：還沒有線上角色 */
  character: CharacterMeta | null | undefined;
  /** 正在讀取玩家檔案與角色 */
  loading: boolean;
  /** 正在送出（設定名稱、進入線上世界） */
  busy: boolean;
  /** 最後一次錯誤：i18n key（online.*）或伺服器訊息 */
  error: string | null;
  /** 這個角色在別的地方存過檔（revision 對不上）：這一局之後不再存檔，請玩家回到標題重新進入 */
  saveConflict: boolean;
};

export const useOnlineStore = create<OnlineState>(() => ({
  mode: 'offline',
  config: null,
  profile: null,
  character: undefined,
  loading: false,
  busy: false,
  error: null,
  saveConflict: false,
}));

function userId(): string | null {
  return useAccountStore.getState().userId;
}

export function isOnline(): boolean {
  return useOnlineStore.getState().mode === 'online';
}

/** 線上時的顯示名稱（連線到遊戲伺服器用）；單機或還沒載入時是 null */
export function onlineDisplayName(): string | null {
  const { mode, profile } = useOnlineStore.getState();
  return mode === 'online' ? (profile?.displayName ?? null) : null;
}

/** 讀取遊戲設定（未登入也能讀）。讀不到時當作沒有維護，不阻擋玩家。 */
export async function loadOnlineConfig(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('game_config').select('maintenance, maintenance_message, motd').maybeSingle();
  if (error) {
    console.warn('[online] 讀取遊戲設定失敗：', error.message);
    return;
  }
  if (data) useOnlineStore.setState({ config: { maintenance: data.maintenance, maintenanceMessage: data.maintenance_message, motd: data.motd } });
}

/** 登入後讀取玩家檔案與線上角色摘要 */
export async function loadOnlineAccount(): Promise<void> {
  const id = userId();
  if (!supabase || !id) return;
  useOnlineStore.setState({ loading: true, error: null });
  try {
    const [profileRes, characterRes] = await Promise.all([
      supabase.from('profiles').select('display_name, role, status, banned_until, ban_reason').eq('id', id).maybeSingle(),
      supabase.from('characters').select('id, revision, saved_at, play_time').eq('user_id', id).eq('slot', CHARACTER_SLOT).maybeSingle(),
    ]);
    if (profileRes.error) throw new Error(profileRes.error.message);
    if (characterRes.error) throw new Error(characterRes.error.message);
    // profile 由註冊時的觸發器建立；萬一還沒建立，當作還沒設定名稱的一般玩家
    const p = profileRes.data;
    const c = characterRes.data;
    useOnlineStore.setState({
      profile: {
        displayName: p?.display_name ?? null,
        role: (p?.role as OnlineRole | undefined) ?? 'player',
        status: p?.status === 'banned' ? 'banned' : 'active',
        bannedUntil: p?.banned_until ?? null,
        banReason: p?.ban_reason ?? null,
      },
      character: c ? { id: c.id, revision: c.revision, savedAt: c.saved_at, playTime: c.play_time } : null,
      loading: false,
    });
  } catch (err) {
    console.error('[online] 讀取帳號資料失敗：', err);
    useOnlineStore.setState({ loading: false, error: 'online.loadFailed' });
  }
}

/** 登出時清掉帳號相關的資料（遊戲設定保留） */
export function clearOnlineAccount(): void {
  useOnlineStore.setState({ profile: null, character: undefined, loading: false, busy: false, error: null });
}

/** 設定顯示名稱（第一次進入線上時）。名稱重複、太短太長、含屏蔽詞時回傳 false 並設定錯誤。 */
export async function saveDisplayName(raw: string): Promise<boolean> {
  const id = userId();
  const { profile } = useOnlineStore.getState();
  if (!supabase || !id || !profile) return false;
  const check = checkDisplayName(raw, NAME_FILTER);
  if (!check.ok) {
    useOnlineStore.setState({ error: `online.name.${check.reason}` });
    return false;
  }
  useOnlineStore.setState({ busy: true, error: null });
  const { error } = await supabase.from('profiles').update({ display_name: check.name }).eq('id', id);
  if (error) {
    // 23505：唯一索引衝突（不分大小寫已有人使用）
    useOnlineStore.setState({ busy: false, error: error.code === '23505' ? 'online.name.taken' : error.message });
    return false;
  }
  useOnlineStore.setState({ busy: false, profile: { ...profile, displayName: check.name } });
  return true;
}

/** 讀取線上角色的完整存檔（進入線上世界時）。沒有角色時回傳 null。 */
export async function fetchOnlineSave(): Promise<{ meta: CharacterMeta; save: unknown } | null> {
  const id = userId();
  if (!supabase || !id) throw new Error('未登入');
  const { data, error } = await supabase
    .from('characters')
    .select('id, revision, saved_at, play_time, save')
    .eq('user_id', id)
    .eq('slot', CHARACTER_SLOT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { meta: { id: data.id, revision: data.revision, savedAt: data.saved_at, playTime: data.play_time }, save: data.save };
}

/** 切換這一局的模式。進入線上時清掉上一局的存檔衝突。 */
export function setPlayMode(mode: PlayMode, character?: CharacterMeta | null): void {
  useOnlineStore.setState({ mode, saveConflict: false, ...(character !== undefined ? { character } : {}) });
}

/**
 * 寫入線上角色。第一次存檔建立角色；之後以讀到的 revision 更新，對不上（別的分頁、裝置已存過，或帳號被停權）時
 * 不覆蓋，標記 saveConflict 並丟出錯誤（之後這一局不再嘗試存檔）。
 */
export async function writeOnlineSave(data: SaveData): Promise<void> {
  const id = userId();
  const { character, saveConflict } = useOnlineStore.getState();
  if (!supabase || !id) throw new Error('未登入');
  if (saveConflict) throw new Error('online.saveConflict');
  const fields = { save: data as unknown as Json, save_version: data.version, play_time: data.world.time, saved_at: data.savedAt };
  const query = character
    ? supabase.from('characters').update(fields).eq('id', character.id).eq('revision', character.revision)
    : supabase.from('characters').insert({ ...fields, user_id: id, slot: CHARACTER_SLOT });
  const { data: row, error } = await query.select('id, revision, saved_at, play_time').maybeSingle();
  // 23505：建立角色時別的分頁已經建立過（同一帳號同一格只能有一個）
  if (error && error.code !== '23505') throw new Error(error.message);
  if (error || !row) {
    useOnlineStore.setState({ saveConflict: true });
    useUiStore.getState().pushToast({ textKey: 'online.saveConflict' });
    throw new Error('online.saveConflict');
  }
  useOnlineStore.setState({ character: { id: row.id, revision: row.revision, savedAt: row.saved_at, playTime: row.play_time } });
}
