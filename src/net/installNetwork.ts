// 啟動時安裝一次（main.tsx）：進入遊戲時自動連線，回到主選單時中斷連線，關閉視窗時主動離開。
// 自動連線的時機：線上模式的一局（任務 11L-2，以帳號的顯示名稱連線），或網址帶 ?mp=1（開發與 e2e 用，不需登入）。
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStore } from '@/game/state/gameStore';
import { onlineDisplayName } from '@/online/onlineStore';
import { autoConnectFromUrl } from './config';
import { connect, disconnect, leaveOnPageHide } from './netClient';

export function installNetwork(): void {
  leaveOnPageHide();
  const auto = autoConnectFromUrl();
  useGameStore.subscribe((state, prev) => {
    if (state.screen === prev.screen) return;
    if (state.screen === 'title') void disconnect();
    else if (prev.screen === 'title') tryAutoConnect();
  });
  // 場景就緒後玩家才站在正確的位置（出生點或存檔位置），之前帶給伺服器的位置會是原點
  useDebugStore.subscribe((state, prev) => {
    if (state.sceneReady && !prev.sceneReady) tryAutoConnect();
  });
  tryAutoConnect();

  function tryAutoConnect(): void {
    if (useGameStore.getState().screen === 'title' || !useDebugStore.getState().sceneReady) return;
    const onlineName = onlineDisplayName();
    const target = onlineName ? { name: onlineName } : auto;
    if (target) void connect(target);
  }
}
