import { authority } from './authority';
import { loadMainSave, saveGame } from './save/saveService';
import { currentScreen, useGameStore } from './state/gameStore';
import { useUiStore } from './state/uiStore';

// 一局遊戲的開始與結束（主選單與暫停選單呼叫），以及自動存檔（規格 6.8）。

export function startNewGame(): void {
  useGameStore.getState().beginSession(null);
}

/** 繼續遊戲：重新讀取主存檔（主檔損壞時用備份）。讀不到時回傳 false，畫面停在主選單並顯示原因。 */
export async function continueGame(): Promise<boolean> {
  const outcome = await loadMainSave();
  if (outcome.status !== 'ok' && outcome.status !== 'restored-from-backup') return false;
  useGameStore.getState().beginSession(outcome.value);
  if (outcome.status === 'restored-from-backup') useUiStore.getState().pushToast({ textKey: 'save.restoredFromBackup' });
  return true;
}

/** 回到主選單前先存檔 */
export async function returnToTitle(): Promise<void> {
  await saveGame();
  useGameStore.getState().send('returnToTitle');
}

/** 進入新區域時自動存檔（規格 6.8：區域切換時自動存檔）。區域名稱由 RegionBanner 顯示。 */
export function onRegionChanged(): void {
  if (currentScreen() === 'playing') void saveGame();
}

/** 世界或背包改變後多久自動存檔（秒）：連續採集時合併成一次 */
const CHANGE_DEBOUNCE_MS = 2000;
/** 遊玩中的定時存檔間隔 */
const INTERVAL_MS = 60_000;

/** 自動存檔：權威狀態改變後（採集、開箱、接取 / 完成任務、迷霧改變）延遲存檔，以及遊玩中定時存檔。只在啟動時安裝一次。 */
export function installAutosave(): void {
  let timer: number | null = null;
  authority.subscribe((events) => {
    const changed = events.some((e) =>
      ['ObjectHarvested', 'ChestOpened', 'ItemsGained', 'QuestAccepted', 'QuestCompleted', 'MistStageChanged'].includes(e.type),
    );
    if (!changed) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (currentScreen() !== 'title') void saveGame();
    }, CHANGE_DEBOUNCE_MS);
  });
  window.setInterval(() => {
    if (currentScreen() === 'playing') void saveGame();
  }, INTERVAL_MS);
}
