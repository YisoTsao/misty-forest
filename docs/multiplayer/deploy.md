# 部署（任務 11D，〈多人連線規劃〉Phase 4）

整體架構與流程圖見 `online-plan.md`。這份是實際的設定與步驟。

| 部分 | 平台 | 設定檔 | 網址 |
|---|---|---|---|
| 網頁版前端（`dist/`） | Vercel（Hobby，團隊 `yisotsaos-projects`） | `vercel.json` | 正式：`https://mistwood-blue.vercel.app`（專案 `mistwood`；`mistwood.vercel.app` 已被別人使用）；預覽：`https://mistwood-<雜湊或 git-分支>-yisotsaos-projects.vercel.app`（Vercel 的部署保護，需登入） |
| 遊戲伺服器（`dist-server/server.mjs`） | Render（Free，新加坡） | `render.yaml`（Blueprint） | `https://mistwood-game-server.onrender.com`（名稱被用掉時 Render 會加後綴） |
| 桌面版 | 本機 `pnpm dist` | `electron-builder.yml` | 建置時以 `VITE_GAME_SERVER_URL` 指向同一台伺服器 |

正式上線的分支是 `main`（使用者決定，`online-plan.md` §8）：`develop` 合併到 `main` 後，Vercel 與 Render 都自動部署。

## 環境變數

| 平台 | 變數 | 值 |
|---|---|---|
| Vercel（Production 與 Preview） | `VITE_GAME_SERVER_URL` | `wss://mistwood-game-server.onrender.com`（建置時寫進前端與 CSP） |
| Vercel | `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` |
| Render | `NODE_VERSION` | `24`（`render.yaml` 已設定） |
| Render | `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1`（`render.yaml` 已設定） |
| Render | `ALLOWED_ORIGINS` | `https://mistwood-blue.vercel.app,https://mistwood-*-yisotsaos-projects.vercel.app,null,file://` |
| Render | `PORT` | Render 自動提供，伺服器會讀 |

`ALLOWED_ORIGINS`：逗號分隔，`*` 只比對英數與連字號（不跨越 `.` 與 `/`）；`null`、`file://` 是 Electron 正式版（`file://` 頁面送出的 Origin）。沒設定時全部允許。來源檢查只防止別的網站在瀏覽器裡連過來，不是身分驗證（Phase 5 改用 Supabase 的 JWT）。

## 第一次部署

1. **GitHub**：`develop` 快轉合併到 `main` 並 push。
2. **Vercel**：建立專案、連到 `YisoTsao/misty-forest`、Production Branch 設 `main`，設定上表的環境變數。`vercel.json` 已指定安裝（先裝 pnpm 12.11.2）、建置（`pnpm build:web`）、輸出（`dist`）與 `/assets/*` 的長效快取。
3. **Render**（需要使用者在後台操作）：
   1. 用 GitHub 登入 <https://dashboard.render.com>，授權存取 `YisoTsao/misty-forest`。
   2. New → **Blueprint** → 選這個 repo，Render 會讀 `render.yaml`。
   3. 建立時填 `ALLOWED_ORIGINS`（上表）。
   4. 等第一次建置完成，打開 `https://<服務>.onrender.com/health`，應該回 `{"ok":true,...}`。
   5. 實際的服務網址如果不是 `mistwood-game-server.onrender.com`，改 Vercel 的 `VITE_GAME_SERVER_URL` 並重新部署。
4. **驗證**：兩個瀏覽器（或一個瀏覽器加一台 Electron）開正式網址，Esc →「多人連線」→ 連線：互相看得到、人數 2。Render 休眠時第一次連線約 30–60 秒，畫面會顯示喚醒提示。

## Electron 桌面版連正式伺服器

```bash
VITE_GAME_SERVER_URL=wss://mistwood-game-server.onrender.com pnpm dist
```

## 本機模擬部署（不需要帳號）

```bash
# Render：乾淨目錄安裝與建置伺服器，以正式的環境變數啟動
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --frozen-lockfile && pnpm build:server
PORT=10000 ALLOWED_ORIGINS='https://mistwood-blue.vercel.app,null,file://' pnpm start:server
curl localhost:10000/health
# Vercel：建置前端，確認 CSP 加入了 wss:// 伺服器
VITE_GAME_SERVER_URL=wss://mistwood-game-server.onrender.com pnpm build:web && grep -o "connect-src[^;]*" dist/index.html
```

## 免費方案的限制

- Render Free：沒有連線 15 分鐘後休眠，喚醒約 30–60 秒（客戶端自動重新加入最多等 3 分鐘，T-172）；每月 750 小時。房間狀態在記憶體，重新部署或休眠時房間消失，客戶端自動重新加入。
- Vercel Hobby：限非商業用途。
- 網頁版 `?debug=1` 在正式網址仍可用（單人的除錯指令；多人的位置仍由伺服器驗證）。是否在正式版關掉，之後再決定（`LAUNCH_PLAN.md` W1）。
