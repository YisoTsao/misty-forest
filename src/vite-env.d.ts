/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 遊戲伺服器位址（ws:// 或 wss://），沒設定時用 ws://localhost:2567；不可放任何秘密資料 */
  readonly VITE_GAME_SERVER_URL?: string;
  /** 遊戲版本，建置時由 vite.config.ts 從 package.json 寫入 */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
