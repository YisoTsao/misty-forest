// 聊天的純函式（任務 11F，docs/multiplayer/protocol.md）：伺服器與客戶端共用。
// 清理文字、髒話遮蔽、頻率與重複檢查、聊天輸入列的指令解析。不 import Colyseus 與 React。
import { INVISIBLE_CHARS, NET, type ChatChannel } from './protocol';

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** 清理一則聊天：去控制字元與看不見的字元、折疊空白、去頭尾空白、依 code point 截到 chatMaxLength。清完是空的就回傳空字串 */
export function sanitizeChat(raw: string): string {
  const cleaned = raw.replace(CONTROL, ' ').replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
  return [...cleaned].slice(0, NET.chatMaxLength).join('').trim();
}

/** 髒話過濾：詞表裡的字（不分大小寫）換成同樣長度的 * */
export class ChatFilter {
  private readonly words: string[][];

  constructor(words: readonly string[]) {
    this.words = words
      .map((w) => [...w.trim().toLowerCase()])
      .filter((w) => w.length > 0)
      // 長的先比對，避免短詞先遮掉一部分
      .sort((a, b) => b.length - a.length);
  }

  mask(text: string): string {
    const chars = [...text];
    const lower = chars.map((c) => c.toLowerCase());
    const masked = new Array<boolean>(chars.length).fill(false);
    for (let i = 0; i < chars.length; i++) {
      for (const word of this.words) {
        if (i + word.length > chars.length) continue;
        if (word.every((c, k) => lower[i + k] === c)) for (let k = 0; k < word.length; k++) masked[i + k] = true;
      }
    }
    return chars.map((c, i) => (masked[i] ? '*' : c)).join('');
  }
}

/** 一段時間內最多幾次（滑動視窗）。times 由呼叫端保存；通過時記下這次 */
export function acceptInWindow(times: number[], now: number, windowMs: number, max: number): boolean {
  while (times.length > 0 && now - times[0]! >= windowMs) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}

/** 名字比對：不分大小寫、去頭尾空白（密語、靜音用） */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 聊天輸入列解析的結果 */
export type ChatInput =
  | { type: 'send'; channel: ChatChannel; text: string; to?: string }
  | { type: 'mute' | 'unmute'; name: string }
  | { type: 'error'; key: 'chat.err.unknownCommand' | 'chat.err.whisperUsage' | 'chat.err.nameMissing' }
  | { type: 'empty' };

/**
 * 解析聊天輸入列：
 * - 沒有前綴：用目前的頻道（附近或全服）
 * - `/s 訊息`、`/g 訊息`：附近、全服
 * - `/w 名字 訊息`：密語（名字不能有空白）
 * - `/mute 名字`、`/unmute 名字`：本機靜音
 */
export function parseChatInput(raw: string, current: 'say' | 'global'): ChatInput {
  const text = raw.trim();
  if (!text) return { type: 'empty' };
  if (!text.startsWith('/')) return { type: 'send', channel: current, text };
  const [command = '', ...rest] = text.slice(1).split(' ');
  const args = rest.join(' ').trim();
  switch (command.toLowerCase()) {
    case 's':
    case 'say':
      return args ? { type: 'send', channel: 'say', text: args } : { type: 'empty' };
    case 'g':
    case 'global':
      return args ? { type: 'send', channel: 'global', text: args } : { type: 'empty' };
    case 'w':
    case 'whisper': {
      const space = args.indexOf(' ');
      if (space <= 0) return { type: 'error', key: 'chat.err.whisperUsage' };
      const message = args.slice(space + 1).trim();
      if (!message) return { type: 'error', key: 'chat.err.whisperUsage' };
      return { type: 'send', channel: 'whisper', to: args.slice(0, space), text: message };
    }
    case 'mute':
    case 'unmute':
      return args ? { type: command.toLowerCase() as 'mute' | 'unmute', name: args } : { type: 'error', key: 'chat.err.nameMissing' };
    default:
      return { type: 'error', key: 'chat.err.unknownCommand' };
  }
}
