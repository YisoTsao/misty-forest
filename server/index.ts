// 遊戲伺服器進入點（任務 11A）：`pnpm dev:server`（開發，改檔自動重啟）或 `pnpm start:server`（建置後）。
// 監聽 0.0.0.0，區域網路內的其他裝置可以連開發電腦的 IP（防火牆要允許）。
// Ctrl+C / SIGTERM 由 Colyseus 內建的 gracefullyShutdown 處理（先關閉房間再結束）。
import { createGameServer } from './app';

const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);
const host = process.env.GAME_SERVER_HOST ?? '0.0.0.0';

const server = createGameServer();
await server.listen(port, host);
console.info(`[mistwood-server] 已啟動：ws://${host === '0.0.0.0' ? 'localhost' : host}:${port}（健康檢查 /health）`);
