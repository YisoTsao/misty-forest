// 遊戲伺服器進入點（任務 11A）：`pnpm dev:server`（開發，改檔自動重啟）或 `pnpm start:server`（建置後）。
// 監聽 0.0.0.0，區域網路內的其他裝置可以連開發電腦的 IP（防火牆要允許）。
// Ctrl+C / SIGTERM 由 Colyseus 內建的 gracefullyShutdown 處理（先關閉房間再結束）。
import { createGameServer } from './app';
import { parseAllowedOrigins } from './origins';

const port = Number(process.env.GAME_SERVER_PORT ?? process.env.PORT ?? 2567);
const host = process.env.GAME_SERVER_HOST ?? '0.0.0.0';

// 部署時設定 ALLOWED_ORIGINS（逗號分隔，支援 *）；沒設定時全部允許（本機開發）
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const server = createGameServer({ allowedOrigins });
await server.listen(port, host);
console.info(`[mistwood-server] 已啟動：ws://${host === '0.0.0.0' ? 'localhost' : host}:${port}（健康檢查 /health）`);
console.info(`[mistwood-server] 允許的來源：${allowedOrigins.length ? allowedOrigins.map((r) => r.raw).join('、') : '全部（沒有設定 ALLOWED_ORIGINS）'}`);
