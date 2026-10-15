import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { chatRuntime } from '@/net/chatStore';
import { useNetStore } from '@/net/netStore';

/** 泡泡的樣式：名牌上方、限制寬度、自動換行（任務 11F） */
export const BUBBLE_CLASS =
  'pointer-events-none absolute bottom-full left-1/2 mb-1.5 w-max max-w-48 -translate-x-1/2 rounded-xl bg-white/90 px-2.5 py-1 text-xs font-normal break-words whitespace-normal text-slate-800 shadow-lg';

/**
 * 每幀更新泡泡的文字與顯示（drei Html 的內容在另一個 React root，裡面不能用 useFrame，所以由外面寫 DOM）。
 * 回傳是否正在顯示。
 */
export function updateBubble(el: HTMLDivElement | null, sessionId: string | null, now: number): boolean {
  if (!el) return false;
  const bubble = sessionId ? chatRuntime.bubbles.get(sessionId) : undefined;
  const showing = !!bubble && bubble.until > now;
  if (!showing) {
    if (bubble && sessionId) chatRuntime.bubbles.delete(sessionId);
    if (el.style.display !== 'none') el.style.display = 'none';
    return false;
  }
  if (el.textContent !== bubble.text) el.textContent = bubble.text;
  if (el.style.display !== '') el.style.display = '';
  return true;
}

/** 本機玩家頭上的對話泡泡：多人連線時才掛上 */
export function LocalChatBubble() {
  const online = useNetStore((s) => s.status !== 'offline');
  return online ? <LocalBubble /> : null;
}

function LocalBubble() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => updateBubble(ref.current, useNetStore.getState().sessionId, performance.now()));
  return (
    <Html position={[0, 1.75, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="relative">
        <div ref={ref} data-testid="chat-bubble-self" className={BUBBLE_CLASS} style={{ display: 'none' }} />
      </div>
    </Html>
  );
}
