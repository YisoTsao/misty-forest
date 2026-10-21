import { fetchOnlineSave, setPlayMode, useOnlineStore } from '@/online/onlineStore';
import { endOnlineSession, startOnlineSession } from '@/online/onlineSession';
import { DEFAULT_HERO_CLASS, type HeroClassId } from '@/game-core/character/heroClass';
import { authority } from './authority';
import { enterFullscreenOnTouch } from './input/mobileGuards';
import { loadedFromSaveData, loadMainSave, saveGame } from './save/saveService';
import { currentScreen, useGameStore } from './state/gameStore';
import { useUiStore } from './state/uiStore';

// 一局遊戲的開始與結束（主選單與暫停選單呼叫），以及自動存檔（規格 6.8）。

/** 新遊戲：以選好的職業開始（使用者 2026-10-17：四種職業） */
export function startNewGame(heroClass: HeroClassId = DEFAULT_HERO_CLASS): void {
  enterFullscreenOnTouch();
  setPlayMode('offline');
  useGameStore.getState().beginSession(null);
  authority.send({ type: 'ChooseClass', heroClass });
}

/** 繼續遊戲：重新讀取主存檔（主檔損壞時用備份）。讀不到時回傳 false，畫面停在主選單並顯示原因。 */
export async function continueGame(): Promise<boolean> {
  // 手機：開始遊玩時進入全螢幕（要在第一個 await 之前，仍算點擊的手勢）
  enterFullscreenOnTouch();
  const outcome = await loadMainSave();
  if (outcome.status !== 'ok' && outcome.status !== 'restored-from-backup') return false;
  setPlayMode('offline');
  useGameStore.getState().beginSession(outcome.value);
  if (outcome.status === 'restored-from-backup') useUiStore.getState().pushToast({ textKey: 'save.restoredFromBackup' });
  return true;
}

/**
 * 進入線上世界（任務 11L-2）：讀取資料庫的線上角色，沒有角色時以 heroClass 從新遊戲開始（第一次存檔時建立）。
 * 連線到遊戲伺服器由 installNetwork 在場景就緒後進行。讀取失敗或存檔格式錯誤時回傳 false，畫面停在主選單。
 */
export async function enterOnlineWorld(heroClass: HeroClassId = DEFAULT_HERO_CLASS): Promise<boolean> {
  enterFullscreenOnTouch();
  useOnlineStore.setState({ busy: true, error: null });
  try {
    const remote = await fetchOnlineSave();
    const loaded = remote ? loadedFromSaveData(remote.save) : null;
    setPlayMode('online', remote?.meta ?? null);
    useGameStore.getState().beginSession(loaded);
    if (!loaded) authority.send({ type: 'ChooseClass', heroClass });
    useOnlineStore.setState({ busy: false });
    void startOnlineSession();
    return true;
  } catch (err) {
    console.error('[online] 進入線上世界失敗：', err);
    useOnlineStore.setState({ busy: false, error: 'online.enterFailed' });
    return false;
  }
}

/** 回到主選單前先存檔；線上的一局同時結束遊玩紀錄、回到單機模式（主選單的「繼續遊戲」仍是本機存檔） */
export async function returnToTitle(): Promise<void> {
  await saveGame();
  useGameStore.getState().send('returnToTitle');
  if (useOnlineStore.getState().mode === 'online') {
    setPlayMode('offline');
    await endOnlineSession();
  }
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
      ['ObjectHarvested', 'ChestOpened', 'ItemsGained', 'QuestAccepted', 'QuestCompleted', 'QuestProgressed', 'MistStageChanged', 'ObjectRepaired'].includes(e.type),
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
