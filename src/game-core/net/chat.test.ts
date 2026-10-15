import { describe, expect, it } from 'vitest';
import chatBlocklist from '@/data/chatBlocklist.json';
import { acceptInWindow, ChatFilter, parseChatInput, sameName, sanitizeChat } from './chat';
import { NET, sanitizeName } from './protocol';

describe('聊天文字清理（任務 11F）', () => {
  it('去控制字元、零寬與雙向控制字元，折疊空白', () => {
    expect(sanitizeChat('  a\tb\n\nc  ')).toBe('a b c');
    expect(sanitizeChat('ad\u200bmin\u202e\ufeff')).toBe('admin');
    expect(sanitizeChat('\u200b \u200b')).toBe('');
  });

  it('保留組合 emoji 需要的 ZWJ 與變體選擇字元', () => {
    expect(sanitizeChat('👨\u200d👩\u200d👧 ❤\ufe0f')).toBe('👨\u200d👩\u200d👧 ❤\ufe0f');
  });

  it('依字數（code point）截斷，不切斷 emoji', () => {
    const text = '🌟'.repeat(NET.chatMaxLength + 10);
    expect([...sanitizeChat(text)]).toHaveLength(NET.chatMaxLength);
    expect(sanitizeChat(text).endsWith('🌟')).toBe(true);
  });

  it('名字也去掉看不見的字元', () => {
    expect(sanitizeName('B\u200bob', '旅人')).toBe('Bob');
  });
});

describe('髒話過濾', () => {
  const filter = new ChatFilter(chatBlocklist.words);

  it('不分大小寫，換成同樣長度的 *，其他文字不變', () => {
    expect(filter.mask('Oh SHIT, 你這個王八蛋!')).toBe('Oh ****, 你這個***!');
  });

  it('不誤傷常用字', () => {
    expect(filter.mask('你在幹嘛？能幹的人')).toBe('你在幹嘛？能幹的人');
  });

  it('長的詞先比對；空的詞被忽略', () => {
    expect(new ChatFilter(['ab', 'abcd', '']).mask('xabcdx')).toBe('x****x');
  });
});

describe('頻率（滑動視窗）', () => {
  it('視窗內最多 max 次，舊的過了視窗就不算', () => {
    const times: number[] = [];
    expect([0, 1, 2].map((t) => acceptInWindow(times, t, 1000, 2))).toEqual([true, true, false]);
    expect(acceptInWindow(times, 1000, 1000, 2)).toBe(true);
  });
});

describe('聊天輸入列的指令', () => {
  it('沒有前綴用目前的頻道；/s、/g 切換', () => {
    expect(parseChatInput('嗨', 'say')).toEqual({ type: 'send', channel: 'say', text: '嗨' });
    expect(parseChatInput('嗨', 'global')).toEqual({ type: 'send', channel: 'global', text: '嗨' });
    expect(parseChatInput('/g 大家好', 'say')).toEqual({ type: 'send', channel: 'global', text: '大家好' });
    expect(parseChatInput('/S 附近的人', 'global')).toEqual({ type: 'send', channel: 'say', text: '附近的人' });
  });

  it('/w 名字 訊息：密語；少了訊息或名字時提示用法', () => {
    expect(parseChatInput('/w Bob 晚點見', 'say')).toEqual({ type: 'send', channel: 'whisper', to: 'Bob', text: '晚點見' });
    expect(parseChatInput('/w Bob', 'say')).toEqual({ type: 'error', key: 'chat.err.whisperUsage' });
    expect(parseChatInput('/w', 'say')).toEqual({ type: 'error', key: 'chat.err.whisperUsage' });
  });

  it('/mute、/unmute 名字；未知指令、空白', () => {
    expect(parseChatInput('/mute Bob', 'say')).toEqual({ type: 'mute', name: 'Bob' });
    expect(parseChatInput('/unmute  Bob ', 'say')).toEqual({ type: 'unmute', name: 'Bob' });
    expect(parseChatInput('/mute', 'say')).toEqual({ type: 'error', key: 'chat.err.nameMissing' });
    expect(parseChatInput('/dance', 'say')).toEqual({ type: 'error', key: 'chat.err.unknownCommand' });
    expect(parseChatInput('   ', 'say')).toEqual({ type: 'empty' });
    expect(parseChatInput('/g', 'say')).toEqual({ type: 'empty' });
  });

  it('名字比對不分大小寫', () => {
    expect(sameName(' Bob', 'bob')).toBe(true);
    expect(sameName('Bob', 'Bobby')).toBe(false);
  });
});
