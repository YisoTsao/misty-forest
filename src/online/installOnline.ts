// 啟動時安裝一次（main.tsx）：還原登入、讀取遊戲設定；登入的帳號改變時讀取玩家檔案與線上角色。
import { startAccountListener, useAccountStore } from '@/account/accountStore';
import { clearOnlineAccount, loadOnlineAccount, loadOnlineConfig } from './onlineStore';
import { endOnlineSessionOnPageHide } from './onlineSession';

export function installOnline(): void {
  useAccountStore.subscribe((state, prev) => {
    // Supabase 換發 token 時也會通知，只在帳號真的改變時重新讀取
    if (state.userId === prev.userId) return;
    if (state.userId) void loadOnlineAccount();
    else clearOnlineAccount();
  });
  startAccountListener();
  void loadOnlineConfig();
  endOnlineSessionOnPageHide();
}
