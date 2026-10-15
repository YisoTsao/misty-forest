// 聊天的客戶端狀態（任務 11F）：聊天紀錄（最近 100 則）、目前的頻道、本機靜音名單。
// 頭上的對話泡泡放在可變的 chatRuntime，由 3D 場景每幀讀取，不觸發 React 重新渲染。
import { create } from 'zustand';
import { sameName } from '@/game-core/net/chat';
import type { ChatOut } from '@/game-core/net/protocol';

/** 聊天紀錄保留的則數 */
const MAX_LINES = 100;
/** 對話泡泡顯示的時間（毫秒） */
export const BUBBLE_MS = 5000;
const MUTED_KEY = 'mistwood.chat.muted';

/** 一則聊天紀錄：伺服器送來的，或本機產生的提示（指令錯誤、靜音確認，id 為負數） */
export type ChatLine = ChatOut & { receivedAt: number };

type ChatState = {
  lines: readonly ChatLine[];
  /** 沒有指令前綴時送到哪個頻道 */
  channel: 'say' | 'global';
  /** 本機靜音的名字（存在 localStorage；登入後改成帳號層級） */
  muted: readonly string[];
};

function loadMuted(): string[] {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function saveMuted(names: readonly string[]): void {
  try {
    localStorage.setItem(MUTED_KEY, JSON.stringify(names));
  } catch {
    // 私密瀏覽或停用儲存空間時只在這次有效
  }
}

export const useChatStore = create<ChatState>(() => ({ lines: [], channel: 'say', muted: loadMuted() }));

/** 頭上的對話泡泡：sessionId → 文字與消失的時間（performance.now 毫秒） */
export const chatRuntime = {
  bubbles: new Map<string, { text: string; until: number }>(),
};

let nextLocalId = -1;

export function isMuted(name: string): boolean {
  return useChatStore.getState().muted.some((m) => sameName(m, name));
}

/** 收到伺服器的聊天：靜音的人略過；附近與全服的話顯示成說話者頭上的泡泡（紀錄不產生泡泡） */
export function receiveChat(msg: ChatOut, options: { history?: boolean } = {}): void {
  if (msg.from && isMuted(msg.from.name)) return;
  const now = performance.now();
  appendLines([{ ...msg, receivedAt: now }]);
  if (!options.history && msg.from && msg.text && (msg.channel === 'say' || msg.channel === 'global')) {
    chatRuntime.bubbles.set(msg.from.sessionId, { text: msg.text, until: now + BUBBLE_MS });
  }
}

/** 本機的提示（不經過伺服器） */
export function localNotice(key: string, vars?: Record<string, string>): void {
  appendLines([{ id: nextLocalId--, t: Date.now(), channel: 'system', key, ...(vars ? { vars } : {}), receivedAt: performance.now() }]);
}

function appendLines(lines: ChatLine[]): void {
  useChatStore.setState((s) => ({ lines: [...s.lines, ...lines].slice(-MAX_LINES) }));
}

export function setChatChannel(channel: 'say' | 'global'): void {
  useChatStore.setState({ channel });
}

export function mute(name: string): void {
  if (!isMuted(name)) {
    const muted = [...useChatStore.getState().muted, name];
    useChatStore.setState({ muted });
    saveMuted(muted);
  }
  localNotice('chat.muted', { name });
}

export function unmute(name: string): void {
  if (!isMuted(name)) return localNotice('chat.notMuted', { name });
  const muted = useChatStore.getState().muted.filter((m) => !sameName(m, name));
  useChatStore.setState({ muted });
  saveMuted(muted);
  localNotice('chat.unmuted', { name });
}

/** 中斷連線時清掉泡泡（紀錄保留，重新連線後還看得到） */
export function clearBubbles(): void {
  chatRuntime.bubbles.clear();
}
