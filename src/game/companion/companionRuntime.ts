// 本機暫態：星光夥伴的位置（不持久化，規格 5.2）與對話泡泡。
import { create } from 'zustand';
import { pickCompanionHint } from '@/game-core/companion/companion';
import { isQuestReady, questStatus } from '@/game-core/quest/quest';
import { authority, companionDef, quests } from '../authority';
import { t } from '../i18n';
import { keyVars } from '../input/keyLabels';
import { useSettingsStore } from '../state/settingsStore';
import { useUiStore } from '../state/uiStore';

export const companionRuntime = {
  x: 0,
  y: 0,
  z: 0,
  /** 出現動畫進度（解鎖時 0 → 1） */
  appear: 1,
  /** 是否已放到玩家身邊（新遊戲 / 讀檔後第一幀直接放好，不從遠處飛過來） */
  placed: false,
};

/** 泡泡停留時間（毫秒） */
const BUBBLE_MS = 6500;

type BubbleState = { text: string | null; id: number };
export const useCompanionBubble = create<BubbleState>(() => ({ text: null, id: 0 }));
let hideTimer: number | null = null;

/** 讓露米說一句話（i18n key，按鍵名稱依目前設定） */
export function companionSay(textKey: string): void {
  const text = t(textKey, keyVars(useSettingsStore.getState().bindings));
  useCompanionBubble.setState((s) => ({ text, id: s.id + 1 }));
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => useCompanionBubble.setState({ text: null }), BUBBLE_MS);
}

/** 依目前進度給提示（按下「詢問露米」） */
export function companionHint(): void {
  companionSay(pickCompanionHint(companionDef, authority.getState(), { quests }));
}

function readyQuests(): Set<string> {
  const state = authority.getState();
  return new Set([...quests.values()].filter((q) => questStatus(state, q) === 'active' && isQuestReady(state, q)).map((q) => q.id));
}

/** 解鎖時打招呼；任務剛好可以回報時主動提醒。只在啟動時安裝一次。 */
export function installCompanion(): void {
  let ready = readyQuests();
  authority.subscribe((events) => {
    if (events.length === 0) {
      // 新遊戲 / 讀檔：重新放到玩家身邊，不提醒
      companionRuntime.placed = false;
      useCompanionBubble.setState({ text: null });
      ready = readyQuests();
      return;
    }
    if (events.some((e) => e.type === 'CompanionUnlocked')) {
      companionRuntime.appear = 0;
      companionRuntime.placed = false;
      useUiStore.getState().pushToast({ textKey: 'companion.unlocked' });
      companionSay('companion.greet');
    }
    const now = readyQuests();
    const newlyReady = [...now].some((id) => !ready.has(id));
    ready = now;
    if (newlyReady && authority.getState().companion.unlocked) companionHint();
  });
}
