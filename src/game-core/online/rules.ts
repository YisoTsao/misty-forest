// 線上模式的規則（任務 11L-2，DECISIONS T-179）：顯示名稱的檢查、能不能進入線上世界。
// 純函式；資料庫也有同樣的限制（profiles 的 check constraint、RLS），這裡是為了在送出前給玩家明確的提示。
import { ChatFilter } from '../net/chat';
import { INVISIBLE_CHARS, NET } from '../net/protocol';

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = NET.nameMaxLength;

export type NameCheck = { ok: true; name: string } | { ok: false; reason: 'tooShort' | 'tooLong' | 'blocked' };

/** 整理並檢查顯示名稱：去掉控制字元與看不見的字元、前後空白；長度以字（code point）計算，與資料庫的 char_length 一致 */
export function checkDisplayName(raw: string, filter?: ChatFilter): NameCheck {
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(INVISIBLE_CHARS, '').trim();
  const length = [...name].length;
  if (length < DISPLAY_NAME_MIN) return { ok: false, reason: 'tooShort' };
  if (length > DISPLAY_NAME_MAX) return { ok: false, reason: 'tooLong' };
  if (filter && filter.mask(name) !== name) return { ok: false, reason: 'blocked' };
  return { ok: true, name };
}

export type OnlineRole = 'player' | 'gm' | 'admin';

/** profiles 表中與進入線上有關的欄位 */
export type OnlineProfile = {
  displayName: string | null;
  role: OnlineRole;
  status: 'active' | 'banned';
  bannedUntil: string | null;
  banReason: string | null;
};

/** game_config 表中與進入線上有關的欄位 */
export type OnlineConfig = {
  maintenance: boolean;
  maintenanceMessage: string | null;
};

export type OnlineAccess =
  | { kind: 'ok' }
  | { kind: 'needsName' }
  | { kind: 'maintenance'; message: string | null }
  | { kind: 'banned'; until: string | null; reason: string | null };

export function isStaff(role: OnlineRole): boolean {
  return role === 'gm' || role === 'admin';
}

/** 停權中：status 為 banned，且沒有期限（永久）或期限還沒到。到期的停權視為已解除（與資料庫的 private.is_banned 一致） */
export function isBanned(profile: OnlineProfile, now: Date): boolean {
  if (profile.status !== 'banned') return false;
  return profile.bannedUntil === null || new Date(profile.bannedUntil).getTime() > now.getTime();
}

/** 能不能進入線上世界：停權 → 維護中（管理員不受限，方便測試）→ 還沒設定顯示名稱 → 可以 */
export function onlineAccess(profile: OnlineProfile, config: OnlineConfig | null, now: Date): OnlineAccess {
  if (isBanned(profile, now)) return { kind: 'banned', until: profile.bannedUntil, reason: profile.banReason };
  if (config?.maintenance && !isStaff(profile.role)) return { kind: 'maintenance', message: config.maintenanceMessage };
  if (!profile.displayName) return { kind: 'needsName' };
  return { kind: 'ok' };
}
