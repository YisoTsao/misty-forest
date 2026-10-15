# 多人連線的執行與測試

## 啟動

```bash
pnpm dev:server        # 遊戲伺服器（ws://localhost:2567，改檔自動重啟）
pnpm dev               # Web：http://localhost:5173
pnpm dev:electron      # Electron（另開終端機）
```

遊戲中按 Esc →「多人連線」→ 輸入顯示名稱 →「連線」。或在網址加 `?mp=1&mpName=名字` 進入遊戲時自動連線（例如 `http://localhost:5173/?play=1&mp=1&mpName=A`）。

建置後執行：`pnpm build`（含 `build:server`）→ `pnpm start:server`。

### 設定

見 `.env.example`：

- `VITE_GAME_SERVER_URL`：前端連的伺服器（建置時寫入，也會加進 CSP）。Web 與 Electron 共用，只靠這個切換本機 / 正式伺服器。
- `GAME_SERVER_PORT`（或部署平台的 `PORT`）、`GAME_SERVER_HOST`：伺服器監聽的埠與位址。
- 網址參數 `?server=ws://localhost:2599` 可暫時改連其他埠（只限 localhost 或已加入 CSP 的位址）。

### 區域網路試玩

伺服器預設監聽 `0.0.0.0`。其他裝置要連開發電腦的區網 IP，防火牆要允許 2567 埠，並用 `VITE_GAME_SERVER_URL=ws://<區網 IP>:2567 pnpm build` 建置（`localhost` 只會指向各裝置自己）。

## 自動化測試

| 層級 | 指令 | 內容 |
|---|---|---|
| 單元 | `pnpm vitest run src/game-core/net` | 訊息格式、名稱、速度 / 垂直 / 範圍 / 頻率驗證、插值、時鐘同步、停下再走的快照 |
| 來源允許清單 | `pnpm vitest run server/origins` | 清單解析與萬用字元（`origins.test.ts`）；以實際的 HTTP 請求確認其他網站的比對房間被拒、CORS 不回允許標頭、WebSocket 升級 403，Electron（`null`）與沒有 Origin 的請求可以（`originsServer.test.ts`，埠 2596） |
| 房間 | `pnpm vitest run server` | `@colyseus/testing` 在測試程序內啟動伺服器：加入、離開、出生點、其他地圖、協定版本、移動、瞬移、可玩區外、warp 間隔、格式錯誤、頻率限制；斷線續玩（以關閉代碼 4010 模擬斷線：保留座位與離線標記、重連回同一個人、重連後允許一次 warp、逾時移除、主動離開馬上移除） |
| Electron 端對端 | `pnpm build && pnpm e2e:multiplayer` | 啟動 dist-server（2599 埠）與兩個 Electron 視窗，見下 |
| Web 端對端 | `pnpm build && pnpm e2e:multiplayer-web` | `vite preview` + 同一個 Chromium 的兩個分頁（需要 `npx playwright install chromium`，不在 `e2e:all` 內） |

`multiplayer` e2e 檢查：兩個視窗連到同一個房間、人數 2、互相看得到；B 的畫面上看得到 A 的模型與名牌（截圖 `docs/screenshots/phase11/multiplayer_two.png`）；A 走路時 B 每一幀看到的位置都連續（一幀 < 0.5 m、速度 < 9.3 m/s）、動畫是走或跑、位置與 A 本機一致；A 送出瞬移座標被拒絕、B 看到的 A 不跳、A 被拉回；格式錯誤與未知訊息被忽略且不斷線；A 換地圖後伺服器接受、B 不再顯示 A；關掉 A 後 B 移除 A 並顯示通知；停掉伺服器後 B 顯示離線與「重新連線」且還能走動；伺服器重啟後按「重新連線」能再加入。

## 手動測試清單

1. `pnpm dev:server`、`pnpm dev`，開兩個分頁 `?play=1&mp=1&mpName=A`、`?play=1&mp=1&mpName=B`：右上角小地圖下方顯示「已連線 2 人」，看得到對方與名牌。
2. 在其中一個分頁走路、跑步、跳躍：另一個分頁的角色平滑移動、動畫一致，沒有抖動或殘影。
3. 開 Electron（`pnpm dev:electron` 後在暫停選單連線）：三個客戶端都看得到另外兩個。
4. 一個人走進酒館或走過地圖出入口：其他人看不到他；回來後又出現。
5. 關掉一個分頁：其他人看到「○○ 離開了」、人數減一、角色消失。
6. 停掉伺服器（Ctrl+C）：所有客戶端顯示「重新連線中…」，遊戲仍可操作；重新啟動伺服器後幾秒內自動重新加入（3 分鐘內沒有啟動才顯示「重新連線」按鈕）。
6a. 斷線續玩：關掉其中一台的 Wi-Fi 5 秒再打開：自己顯示「重新連線中…」後恢復；其他人看到他停在原地、名牌「（連線不穩）」，恢復後還是同一個人（沒有「離開了」「來到了這個世界」的通知）。
7. 回到主選單：自動中斷連線，其他人看到離開。
