// 遊戲伺服器位址（任務 11A）：Web 與 Electron 共用同一份設定，只靠環境切換。
// 優先順序：網址參數 ?server=（開發、測試、區域網路）> 建置時的 VITE_GAME_SERVER_URL > 本機預設。
export const DEFAULT_SERVER_URL = 'ws://localhost:2567';

const NAME_KEY = 'mistwood.mpName';

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function serverUrl(): string {
  const fromQuery = params().get('server');
  if (fromQuery && /^wss?:\/\/[^\s]+$/.test(fromQuery)) return fromQuery;
  return import.meta.env.VITE_GAME_SERVER_URL || DEFAULT_SERVER_URL;
}

/** ?mp=1：進入遊戲時自動連線（測試與多分頁試玩用）；?mpName= 指定顯示名稱 */
export function autoConnectFromUrl(): { name?: string } | null {
  const p = params();
  if (p.get('mp') !== '1') return null;
  return { name: p.get('mpName') ?? undefined };
}

/** 上次使用的顯示名稱（每個瀏覽器 / 裝置各自記住，讀不到就是空的） */
export function savedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // 私密視窗或封鎖儲存時不記住，不影響連線
  }
}
