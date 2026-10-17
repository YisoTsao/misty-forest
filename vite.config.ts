import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 多人連線（任務 11A）：把建置設定的遊戲伺服器（VITE_GAME_SERVER_URL）加進 CSP 的 connect-src。
 * Colyseus 加入房間前會先發 HTTP matchmake 請求，再開 WebSocket，所以 ws/http（或 wss/https）兩種來源都要允許。
 * localhost 一律允許（本機開發、e2e 用其他埠）。
 */
function gameServerCsp(url: string | undefined): Plugin {
  let origins = '';
  if (url) {
    const u = new URL(url);
    const secure = u.protocol === 'wss:';
    origins = ` ${secure ? 'wss' : 'ws'}://${u.host} ${secure ? 'https' : 'http'}://${u.host}`;
  }
  return { name: 'mistwood-game-server-csp', transformIndexHtml: (html) => html.replace('%GAME_SERVER_ORIGINS%', origins) };
}

/** 帳號（任務 11G）：Supabase 專案的 https 來源加進 connect-src（登入與存檔的 REST 請求）。沒有設定時留空。 */
function supabaseCsp(url: string | undefined): Plugin {
  const origin = url ? ` ${new URL(url).origin}` : '';
  return { name: 'mistwood-supabase-csp', transformIndexHtml: (html) => html.replace('%SUPABASE_ORIGIN%', origin.trim()) };
}

/** 遊戲版本（package.json）：線上遊玩紀錄（player_sessions.app_version）用 */
const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  // Electron 正式版以 file:// 載入，資源路徑需為相對路徑
  base: './',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion) },
  plugins: [react(), tailwindcss(), gameServerCsp(loadEnv(mode, process.cwd(), 'VITE_').VITE_GAME_SERVER_URL), supabaseCsp(loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
}));
