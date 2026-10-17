import { describe, expect, it } from 'vitest';
import { ChatFilter } from '../net/chat';
import { checkDisplayName, isBanned, onlineAccess, type OnlineProfile } from './rules';

const now = new Date('2026-10-17T12:00:00Z');
const profile = (over: Partial<OnlineProfile> = {}): OnlineProfile => ({
  displayName: '旅人',
  role: 'player',
  status: 'active',
  bannedUntil: null,
  banReason: null,
  ...over,
});

describe('checkDisplayName', () => {
  it('去掉前後空白、控制字元與看不見的字元', () => {
    expect(checkDisplayName('  星光​旅人\u0007 ')).toEqual({ ok: true, name: '星光旅人' });
  });

  it('長度以字計算：2 到 16 字', () => {
    expect(checkDisplayName('星')).toEqual({ ok: false, reason: 'tooShort' });
    expect(checkDisplayName('  ')).toEqual({ ok: false, reason: 'tooShort' });
    expect(checkDisplayName('星光')).toEqual({ ok: true, name: '星光' });
    expect(checkDisplayName('一二三四五六七八九十一二三四五六')).toMatchObject({ ok: true });
    expect(checkDisplayName('一二三四五六七八九十一二三四五六七')).toEqual({ ok: false, reason: 'tooLong' });
    // 表情符號是一個字（與資料庫的 char_length 相同），不是兩個 UTF-16 單位
    expect(checkDisplayName('🌟🌙')).toMatchObject({ ok: true });
  });

  it('含有屏蔽詞時拒絕', () => {
    const filter = new ChatFilter(['壞字']);
    expect(checkDisplayName('我是壞字', filter)).toEqual({ ok: false, reason: 'blocked' });
    expect(checkDisplayName('我是好人', filter)).toMatchObject({ ok: true });
  });
});

describe('onlineAccess', () => {
  it('一般玩家、有名稱、沒有維護：可以進入', () => {
    expect(onlineAccess(profile(), { maintenance: false, maintenanceMessage: null }, now)).toEqual({ kind: 'ok' });
    expect(onlineAccess(profile(), null, now)).toEqual({ kind: 'ok' });
  });

  it('還沒設定名稱', () => {
    expect(onlineAccess(profile({ displayName: null }), null, now)).toEqual({ kind: 'needsName' });
  });

  it('維護中：一般玩家不能進入，管理員可以', () => {
    const config = { maintenance: true, maintenanceMessage: '更新中' };
    expect(onlineAccess(profile(), config, now)).toEqual({ kind: 'maintenance', message: '更新中' });
    expect(onlineAccess(profile({ role: 'gm' }), config, now)).toEqual({ kind: 'ok' });
    expect(onlineAccess(profile({ role: 'admin' }), config, now)).toEqual({ kind: 'ok' });
  });

  it('停權優先於其他狀態；到期的停權視為解除', () => {
    const banned = profile({ status: 'banned', bannedUntil: '2026-10-18T00:00:00Z', banReason: '洗頻', displayName: null });
    expect(onlineAccess(banned, { maintenance: true, maintenanceMessage: null }, now)).toEqual({ kind: 'banned', until: '2026-10-18T00:00:00Z', reason: '洗頻' });
    expect(isBanned(profile({ status: 'banned', bannedUntil: null }), now)).toBe(true);
    expect(isBanned(profile({ status: 'banned', bannedUntil: '2026-10-17T11:59:59Z' }), now)).toBe(false);
    expect(onlineAccess(profile({ status: 'banned', bannedUntil: '2026-10-01T00:00:00Z' }), null, now)).toEqual({ kind: 'ok' });
  });
});
