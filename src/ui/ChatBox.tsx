import { useEffect, useRef, useState } from 'react';
import { NET } from '@/game-core/net/protocol';
import { t } from '@/game/i18n';
import { input } from '@/game/input/inputManager';
import { currentScreen, useGameStore } from '@/game/state/gameStore';
import { isModalOpen, useUiStore } from '@/game/state/uiStore';
import { setChatChannel, useChatStore, type ChatLine } from '@/net/chatStore';
import { submitChat } from '@/net/netClient';
import { useNetStore } from '@/net/netStore';

/** 沒開輸入列時顯示的則數與停留時間 */
const IDLE_LINES = 6;
const IDLE_MS = 10_000;
/** 開著輸入列時顯示的則數（可捲動） */
const OPEN_LINES = 60;

const CHANNEL_STYLE: Record<ChatLine['channel'], string> = {
  say: 'text-white',
  global: 'text-amber-200',
  whisper: 'text-pink-200',
  system: 'text-sky-200/90 italic',
};

/**
 * 聊天（任務 11F）：左下角的聊天紀錄與輸入列，連線時才顯示。
 * Enter 或 / 開啟輸入列（/ 會先填好，方便打指令）；開著時是視窗（isModalOpen），角色不動、不施法，Esc 不開暫停選單。
 * Enter 送出並關閉，Esc 取消，Tab 切換附近 / 全服；中文輸入法選字中的 Enter 不送出。
 */
export function ChatBox() {
  const status = useNetStore((s) => s.status);
  const screen = useGameStore((s) => s.screen);
  const open = useUiStore((s) => s.chatOpen);
  const visible = status !== 'offline' && (screen === 'playing' || screen === 'paused');

  // 開啟：遊玩中、沒有其他視窗、已連線時按 Enter 或 /
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || useUiStore.getState().chatOpen) return;
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Slash') return;
      if (currentScreen() !== 'playing' || isModalOpen() || useNetStore.getState().status !== 'connected') return;
      e.preventDefault();
      openChat(e.code === 'Slash' ? '/' : '');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  // 暫停、回主選單、斷線時關掉輸入列
  useEffect(() => {
    if (open && (screen !== 'playing' || status !== 'connected')) closeChat(false);
  }, [open, screen, status]);

  if (!visible) return null;
  return (
    <div className="absolute bottom-36 left-6 flex w-[min(26rem,42vw)] flex-col gap-1 text-[13px]" data-testid="chat">
      <ChatLog open={open} />
      {open ? <ChatInput /> : status === 'connected' && <span className="pointer-events-none text-[11px] text-white/55 drop-shadow">{t('chat.openHint')}</span>}
    </div>
  );
}

/** 開啟時先設成視窗再放開滑鼠：PauseMenu 在失去滑鼠鎖定時，有視窗開著就不會暫停 */
function openChat(prefill: string): void {
  pendingPrefill = prefill;
  input.releaseAll();
  useUiStore.getState().setChatOpen(true);
  if (document.pointerLockElement) document.exitPointerLock();
}

/** relock：由鍵盤事件關閉時（使用者手勢）重新鎖定滑鼠回到遊玩 */
function closeChat(relock: boolean): void {
  useUiStore.getState().setChatOpen(false);
  if (relock && currentScreen() === 'playing') input.requestPointerLock();
}

let pendingPrefill = '';

function ChatInput() {
  const channel = useChatStore((s) => s.channel);
  const [text, setText] = useState(() => pendingPrefill);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 下一個 tick 才 focus：開啟用的 Enter / 斜線不會打進輸入列
    const timer = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    // capture 階段：輸入列開著時按鍵不傳給遊戲、暫停選單與其他視窗（輸入框照常打字）
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.isComposing || e.keyCode === 229) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        closeChat(true);
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        const value = ref.current?.value ?? '';
        if (!value.trim() || submitChat(value)) closeChat(true);
      } else if (e.code === 'Tab') {
        e.preventDefault();
        setChatChannel(useChatStore.getState().channel === 'say' ? 'global' : 'say');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 rounded-lg bg-black/65 p-1 shadow-lg">
        <button
          type="button"
          data-testid="chat-channel"
          title={t('chat.switchChannel')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setChatChannel(channel === 'say' ? 'global' : 'say')}
          className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${channel === 'global' ? 'bg-amber-500/80 text-amber-950' : 'bg-white/20 text-white'}`}
        >
          {t(`chat.channel.${channel}`)}
        </button>
        <input
          ref={ref}
          data-testid="chat-input"
          value={text}
          maxLength={NET.chatMaxLength * 2}
          placeholder={t(`chat.placeholder.${channel}`)}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => closeChat(false)}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-white outline-none placeholder:text-white/45"
        />
      </div>
      <span className="text-[11px] text-white/60 drop-shadow">{t('chat.keys')}</span>
    </div>
  );
}

function ChatLog({ open }: { open: boolean }) {
  const lines = useChatStore((s) => s.lines);
  const [now, setNow] = useState(() => performance.now());
  const listRef = useRef<HTMLDivElement>(null);

  // 沒開輸入列時舊的訊息淡出：每秒重新判斷一次
  useEffect(() => {
    if (open) return;
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const shown = open ? lines.slice(-OPEN_LINES) : lines.slice(-IDLE_LINES).filter((l) => now - l.receivedAt < IDLE_MS);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, open]);

  if (shown.length === 0) return null;
  return (
    <div
      ref={listRef}
      data-testid="chat-log"
      className={`flex flex-col gap-0.5 rounded-lg px-2 py-1 ${open ? 'pointer-events-auto max-h-64 overflow-y-auto bg-black/55' : 'pointer-events-none bg-black/25'}`}
    >
      {shown.map((line) => (
        <ChatRow key={line.id} line={line} />
      ))}
    </div>
  );
}

function ChatRow({ line }: { line: ChatLine }) {
  const style = CHANNEL_STYLE[line.channel];
  if (line.channel === 'system') {
    return (
      <div data-testid="chat-line" data-channel="system" className={`break-words drop-shadow ${style}`}>
        {t(line.key ?? '', line.vars)}
      </div>
    );
  }
  const name = line.from?.name ?? '';
  const who = line.channel === 'whisper' ? (line.to ? t('chat.whisperTo', { name: line.to }) : t('chat.whisperFrom', { name })) : name;
  return (
    <div data-testid="chat-line" data-channel={line.channel} className={`break-words drop-shadow ${style}`}>
      <span className="mr-1 opacity-70">[{t(`chat.channel.${line.channel}`)}]</span>
      <span className="font-bold">{who}</span>
      <span>：{line.text}</span>
    </div>
  );
}
