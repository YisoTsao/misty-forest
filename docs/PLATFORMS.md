# 平台服務設定總覽

> 本文件記錄目前所有外部平台的設定值與存放位置，方便日後重建、交接或除錯。
> **機密值（secret key、API key、密碼）不寫在這裡、不進 git**，只註明放在哪個後台。
> 操作步驟見 `docs/multiplayer/deploy.md`（部署）與 `docs/multiplayer/accounts.md`（Email 與登入）。
> 最後更新：2026-10-17

## 1. 網域（Cloudflare）

| 項目 | 值 |
|---|---|
| 註冊商 / DNS | Cloudflare（nameserver：`hasslo.ns.cloudflare.com`、`isabel.ns.cloudflare.com`） |
| 主網域 | `yisoapp.com` |

### DNS 記錄

| 類型 | 名稱 | 目標 | Proxy | 用途 | 狀態 |
|---|---|---|---|---|---|
| CNAME | `mistwood` | Vercel 提供的目標（`cname.vercel-dns.com` 或後台顯示值） | **灰雲（DNS only）** | 網頁版前端 | 已設定，運作中 |
| CNAME | `mistwood-server` | `mistwood-game-server.onrender.com` | **灰雲（DNS only）** | 遊戲伺服器（WebSocket） | 已設定；Render 端的 Custom Domain 狀態待確認 |
| TXT / MX / CNAME | Resend 提供（例如 `resend._domainkey`、`send`） | Resend 後台給的值 | **灰雲（DNS only）** | Resend 寄信驗證（SPF、DKIM） | 待設定（見第 5 節） |

> **規則**：指向 Vercel 與 Render 的記錄一律灰雲。開橘雲會讓 Render 回 Cloudflare 錯誤 1000（`DNS points to prohibited IP`）。

---

## 2. 網頁版前端（Vercel）

| 項目 | 值 |
|---|---|
| 團隊 | `yisotsaos-projects`（team id：`team_h1FSSo13zCrMozKBq5o1H1Sx`） |
| 專案 | `mistwood`（project id：`prj_plRvTJlwaOfosEC2gjmn1Qsigl0U`） |
| 方案 | Hobby（非商業用途） |
| Git 來源 | GitHub `YisoTsao/misty-forest`，Production Branch `main` |
| 網址 | `https://mistwood.yisoapp.com`（自訂網域）；`https://mistwood-blue.vercel.app`（原網址，仍可用） |
| 預覽網址 | `https://mistwood-<雜湊或分支>-yisotsaos-projects.vercel.app`（需登入） |
| 設定檔 | `vercel.json`（安裝 pnpm 12.11.2、`pnpm build:web`、輸出 `dist`、`/assets/*` 長效快取） |

### 環境變數（Production 與 Preview 都要設）

| 變數 | 值 | 公開？ | 說明 |
|---|---|---|---|
| `VITE_GAME_SERVER_URL` | `wss://mistwood-server.yisoapp.com` | 公開 | 建置時寫進前端與 CSP。改值後必須 Redeploy |
| `VITE_SUPABASE_URL` | `https://dnnlmunlmmhiqpgkjbvr.supabase.co` | 公開 | 也會自動加進 CSP（`vite.config.ts` 的 `supabaseCsp`） |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase 後台 → API 頁面的 publishable key（`sb_publishable_…`） | 公開 | 會打包進網頁與 Electron，不是機密 |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` | — | 部署時不下載 Electron 執行檔 |

---

## 3. 遊戲伺服器（Render）

| 項目 | 值 |
|---|---|
| 服務名稱 | `mistwood-game-server`（**注意**：2026-10-17 後台的 Name 曾被改成 `mistwood-server.yisoapp.com`，需改回） |
| 類型 | Web Service（Node），Blueprint 建立 |
| 區域 / 方案 | Singapore / Free（閒置 15 分鐘休眠） |
| Git 來源 | GitHub `YisoTsao/misty-forest`，分支 `main`，Auto-Deploy 開啟 |
| 設定檔 | `render.yaml` |
| 建置指令 | `npm install -g pnpm@12.11.2 && pnpm install --frozen-lockfile && pnpm build:server` |
| 啟動指令 | `pnpm start:server` |
| 健康檢查 | `/health`（回 `{"ok":true,...}`） |
| 網址 | `https://mistwood-server.yisoapp.com`（自訂網域）；`https://mistwood-game-server.onrender.com`（原網址，仍可用） |

### 環境變數

| 變數 | 值 | 公開？ | 說明 |
|---|---|---|---|
| `NODE_VERSION` | `24` | — | `render.yaml` 已設定 |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` | — | `render.yaml` 已設定 |
| `ALLOWED_ORIGINS` | `https://mistwood.yisoapp.com,https://mistwood-blue.vercel.app,https://mistwood-*-yisotsaos-projects.vercel.app,null,file://` | — | `render.yaml` 標記為 `sync: false`，**只在後台設定**。改了會自動重新部署 |
| `PORT` | Render 自動提供 | — | 伺服器會讀取 |
| `SUPABASE_URL` | `https://dnnlmunlmmhiqpgkjbvr.supabase.co` | 公開 | Phase 5 才需要（伺服器用它取 JWKS 驗證 JWT）。尚未設定 |
| `SUPABASE_SECRET_KEY` | Supabase 後台的 secret key（`sb_secret_…`） | **機密** | 只放 Render。Phase 5 才需要。**不貼到對話、不進 git** |

> `ALLOWED_ORIGINS` 規則：`*` 只比對英數與連字號；`null` 與 `file://` 是 Electron 正式版的來源。沒設定時全部允許（僅限本機開發）。

---

## 4. 資料庫與登入（Supabase）

| 項目 | 值 |
|---|---|
| 專案名稱 | `mistwood` |
| Project ref | `dnnlmunlmmhiqpgkjbvr` |
| 區域 | Singapore |
| 方案 | Free（7 天沒有活動會暫停，測試期每週至少開一次） |
| 專案網址 | `https://dnnlmunlmmhiqpgkjbvr.supabase.co` |
| 資料表 | `profiles`、`characters`、`game_config`、`announcements`、`mail`、`chat_reports`、`moderation_actions`、`player_sessions`、`admin_audit_log`（任務 11L-1，說明與權限見 `docs/multiplayer/database.md`）；舊表 `saves`（任務 11G，待移除） |
| Migration | `supabase/migrations/`（套用方式：Supabase MCP 的 `apply_migration`，或 SQL Editor） |
| 管理員 | `profiles.role` 設為 `gm` 或 `admin`（SQL 見 `database.md`）。目前的 admin：yiso05255@gmail.com（2026-10-17） |

### Auth 設定

| 位置 | 設定 | 值 |
|---|---|---|
| Sign In / Providers → Email | Email OTP Length | 預設 8 位；程式接受 6–8 位（建議統一改為 6） |
| Email Templates | Magic Link、Confirm signup | 兩份都要包含 `{{ .Token }}`（6 位數驗證碼），內容見 `accounts.md` |
| SMTP Settings | Enable Custom SMTP | 方案 A：Resend（見第 5 節）。**尚未完成** |
| Rate Limits | Emails sent per hour | 改用自訂 SMTP 後調高（建議 30） |
| URL Configuration | Site URL | `https://mistwood.yisoapp.com`（**尚未更新**，目前可能仍是舊網址） |
| URL Configuration | Redirect URLs | 加入 `https://mistwood.yisoapp.com`（**尚未完成**） |

### 機密（只存在 Supabase / Render 後台，不寫在這裡）

- Publishable key：Supabase 後台 → API。公開，但仍只從後台複製，不手打。
- Secret key：Supabase 後台 → API。**機密**。

---

## 5. Email 寄送（Resend，方案 A）

| 項目 | 值 |
|---|---|
| 寄件網域 | `yisoapp.com`（**尚未在 Resend 驗證**） |
| 寄件者 | `noreply@yisoapp.com`（寄件者名稱：`迷霧之森`） |
| SMTP Host | `smtp.resend.com` |
| SMTP Port | `465` |
| SMTP Username | `resend` |
| SMTP Password | Resend 建立的 API key（**機密**，只貼到 Supabase SMTP 設定） |
| API key 權限 | Sending access |

### 目前狀態

- [ ] Resend 新增網域 `yisoapp.com`，DNS 記錄加到 Cloudflare（灰雲），狀態 Verified
- [ ] Resend 建立 API key（Sending access）
- [ ] Supabase → SMTP Settings 填入上列值並 Save
- [ ] Supabase → Site URL 與 Redirect URLs 更新
- [ ] 用另一個信箱測試收到 6 位數驗證碼

> 注意：測試用的 `onboarding@resend.dev` **只能寄到註冊 Resend 的信箱**，正式上線前必須改用已驗證的網域。

---

## 6. 桌面版（Electron，本機建置）

| 項目 | 值 |
|---|---|
| App ID | `com.mistwood.game` |
| 產品名稱 | `Mistwood` |
| 設定檔 | `electron-builder.yml`（mac：dmg；win：nsis） |
| 簽章與公證 | 未設定（`identity: null`，Phase 5 處理） |
| 連線的伺服器 | 建置時指定：`VITE_GAME_SERVER_URL=wss://mistwood-server.yisoapp.com pnpm dist` |

---

## 7. 本機開發

`.env` 或 `.env.local`（已在 `.gitignore`，不進版控）。範本見 `.env.example`。

| 變數 | 本機值 |
|---|---|
| `VITE_GAME_SERVER_URL` | `ws://localhost:2567` |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | 留空即停用帳號功能（單機不受影響） |
| `GAME_SERVER_PORT` / `GAME_SERVER_HOST` | `2567` / `0.0.0.0` |

---

## 8. 維護規則

1. **機密不進版控**：secret key、Resend API key、密碼只放在對應平台的後台；對話與文件中一律不貼值。
2. **改網域或網址時**，要同步檢查：Vercel `VITE_GAME_SERVER_URL` → 重新部署；Render `ALLOWED_ORIGINS`；Supabase Site URL 與 Redirect URLs；Electron 建置參數。
3. **灰雲原則**：指向 Vercel 或 Render 的 DNS 記錄不開橘雲。
4. **Supabase 免費方案**：7 天無活動會暫停，測試期間定期開啟。
5. **Render 免費方案**：閒置休眠，第一次連線較慢（見 `deploy.md`）。
6. 平台設定有變動時，同步更新本文件，並在 `docs/PROGRESS.md` 記錄。
