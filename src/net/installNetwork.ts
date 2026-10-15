// 啟動時安裝一次（main.tsx）：進入遊戲時依 ?mp=1 自動連線，回到主選單時中斷連線，關閉視窗時主動離開。
import { useDebugStore } from '@/game/state/debugStore';
import { useGameStore } from '@/game/state/gameStore';
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
    if (!auto || useGameStore.getState().screen === 'title' || !useDebugStore.getState().sceneReady) return;
    void connect(auto);
  }
}
