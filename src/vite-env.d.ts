/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 遊戲伺服器位址（ws:// 或 wss://），沒設定時用 ws://localhost:2567；不可放任何秘密資料 */
  readonly VITE_GAME_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
