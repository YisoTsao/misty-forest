# 帳號與線上登入（任務 11G、11L-2、T-184）

**Google 的 OAuth 登入**（2026-10-17 使用者決定，取代 Email 驗證碼；LINE 登入已於 2026-10-21 依使用者指示移除，T-188，下方 LINE 的設定步驟僅留作紀錄），只用於**線上遊玩**。第一次登入就自動建立並綁定帳號，沒有另外的註冊。實作：`src/account/`（登入）、`electron/oauthLoopback.ts`（桌面版回呼）、`src/online/`（玩家檔案、線上角色、遊玩紀錄）、`src/ui/OnlinePanel.tsx`（主選單的線上頁）。決策見 `docs/DECISIONS.md` T-184（登入方式；取代 T-178）、T-179、T-180（單機與線上分開）；畫面流程見 `ui-flow.md`；資料表見 `database.md`。

## 資料

- 專案：Supabase `mistwood`（ref `dnnlmunlmmhiqpgkjbvr`，新加坡），publishable key 公開，會打包進網頁與 Electron；**沒有** secret key 進客戶端。Google、LINE 的 client secret 只填在 Supabase 後台。
- 線上角色存在 `public.characters`，玩家檔案在 `public.profiles`（說明見 `database.md`）。
- 舊表 `public.saves`（11G 的本機存檔鏡像）已不再使用，資料已複製成線上角色，之後確認再移除。

## 行為

- 登入只在主選單的「線上遊玩」頁進行，一個按鈕：「使用 Google 登入」（LINE 已移除，T-188）。
  - **網頁版**：整頁導到 Google / LINE，登入後導回同一網址（帶一次性的 `code`，PKCE），遊戲換成登入狀態並把參數從網址拿掉。
  - **桌面版（Electron）**：用系統瀏覽器打開登入頁，登入後導回 `http://127.0.0.1:53682/auth/callback`，主程序收下 `code` 交給遊戲，遊戲視窗回到前景。等待時可以「取消登入」，5 分鐘沒完成自動取消。
- **帳號綁定**：Supabase 會把同一個已驗證信箱的登入方式合併成同一個帳號（automatic identity linking）。原本用 Email 驗證碼建立的帳號，用同信箱的 Google 登入就會接上原本的帳號、角色與權限（例如使用者的 `admin`）。LINE 只有在 LINE 提供信箱時才會合併，否則是另一個帳號。
- 第一次進入線上要先取顯示名稱（2–16 字、不分大小寫不能重複、不能含屏蔽詞）。
- **單機存檔不會上傳，線上角色不會寫到本機**（取代 11G 的同步與衝突對話框）。
- 線上的一局每次存檔寫入 `characters`，以 `revision` 檢查：別的分頁或裝置已存過時不覆蓋，提示玩家回到主選單重新進入。
- 沒有設定 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` 時線上頁顯示停用提示（e2e 建置就是這樣），單機完全不受影響。
- LINE 在 Supabase 的識別碼預設 `custom:line`；要換名稱時設定 `VITE_SUPABASE_LINE_PROVIDER`。

## 設定（一次性，使用者在各平台後台操作）

兩邊的 **Callback URL** 都是 Supabase 的：`https://dnnlmunlmmhiqpgkjbvr.supabase.co/auth/v1/callback`（若之後 Supabase 換自訂網域，改成該網域的 `/auth/v1/callback`）。

### A. Google（console.cloud.google.com）

1. 建立或選一個專案 → **APIs & Services → OAuth consent screen**：User type 選 External，填 App name「迷霧之森」、支援信箱；Scopes 只要 `email`、`profile`、`openid`。測試期間可以停在 Testing 並把測試帳號加入 Test users；要給所有人用時按 **Publish app**。
2. **Credentials → Create Credentials → OAuth client ID**：Application type 選 **Web application**。
   - Authorized JavaScript origins：`https://mistwood.yisoapp.com`、`https://mistwood-blue.vercel.app`
   - Authorized redirect URIs：上面的 Supabase Callback URL
3. 建立後複製 **Client ID** 與 **Client secret**。

### B. LINE（developers.line.biz）

4. 建立 Provider → **Create a LINE Login channel**：Region 選台灣（或你的地區），App types 勾 **Web app**，填名稱、說明、圖示、隱私權政策網址。
5. 頻道的 **LINE Login** 分頁 → **Callback URL**：填上面的 Supabase Callback URL。
6. **Basic settings → OpenID Connect → Email address permission → Apply**：上傳隱私權政策頁面的截圖並同意條款。**要拿到信箱才建得了 Supabase 帳號**，這一步不能跳過。
7. 複製 **Channel ID** 與 **Channel secret**；頻道狀態從 Developing 改成 **Published**（Developing 時只有頻道管理員能登入）。

### C. Supabase 後台（dashboard.supabase.com → 專案 mistwood）

8. **Authentication → Sign In / Providers → Google**：開啟，貼上第 3 步的 Client ID、Client secret，Save。
9. 同一頁 **Custom OAuth Providers → New Provider**：
   - Configuration method：**Auto-discovery (OIDC)**
   - Identifier：`custom:line`
   - Name：`LINE`
   - Client ID / Client Secret：第 7 步的 Channel ID / Channel secret
   - Issuer URL：`https://access.line.me`
   - Scopes：`openid profile email`
   - 按 **Create and enable provider**。（免費方案最多 3 個自訂提供者。）
10. **Authentication → URL Configuration**：Site URL `https://mistwood.yisoapp.com`；**Redirect URLs** 加入：
    - `https://mistwood.yisoapp.com/**`
    - `https://mistwood-blue.vercel.app/**`
    - `https://mistwood-*-yisotsaos-projects.vercel.app/**`（Vercel 預覽）
    - `http://127.0.0.1:53682/auth/callback`（桌面版）
    - `http://localhost:5173/**`（本機 `pnpm dev`）
11. 確認 Google 能登入、而且接上原本的帳號後，**Sign In / Providers → Email** 可以關掉（遊戲已經沒有驗證碼的入口；不關也不影響）。原本的 Resend SMTP 設定可以保留或移除。

### D. 測試

12. 開正式網址 → 主選單「線上遊玩」→「使用 Google 登入」→ 選帳號 → 回到遊戲，顯示「已登入：名稱」。用原本的信箱登入時應該是原本的名稱與角色。
13. 「登出」→「使用 LINE 登入」→ LINE 授權頁同意 → 回到遊戲；第一次會要求取名。
14. 桌面版（`pnpm dev:electron` 或打包版）：按登入後系統瀏覽器開啟，完成後瀏覽器顯示「登入完成」、遊戲回到前景並已登入。
15. 失敗時看 Supabase **Logs → Auth**：`redirect_to` 不在 Redirect URLs、Callback URL 不一致、LINE 沒有信箱權限是最常見的原因。

### 常見問題

- 登入後回到遊戲但仍是未登入、出現「登入沒有成功」：Redirect URLs 沒有列出目前的網址（Supabase 會改導回 Site URL，`code` 對不上）。
- Google 顯示 `redirect_uri_mismatch`：Google 的 Authorized redirect URIs 要填 Supabase 的 Callback URL，不是遊戲網址。
- LINE 登入後 Supabase 回 `Error getting user email`：LINE 頻道還沒有 Email address permission，或玩家在授權頁沒有同意提供信箱。
- 桌面版瀏覽器顯示無法連線到 127.0.0.1：遊戲沒有在等待（已取消或逾時），回到遊戲重新按登入；埠號 53682 被其他程式占用時也會失敗。

## Vercel 環境變數（已設定）

`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`（Production 與 Preview）。CSP 的 `connect-src` 由 `vite.config.ts` 的 `supabaseCsp` 依 `VITE_SUPABASE_URL` 加入。

## 手動測試（需要真的 Google / LINE 帳號）

1. 開 https://mistwood.yisoapp.com，主選單切到「線上遊玩」，按「使用 Google 登入」或「使用 LINE 登入」。
2. 登入後回到遊戲：畫面直接變成「已登入」，並要求取名（第一次）。
3. 取名後按「進入線上世界」：沒有線上角色時從頭開始，暫停選單顯示「線上遊玩 · 名稱」，右上角連線狀態變成已連線。
4. 遊玩後存檔（暫停選單「儲存遊戲」或等自動存檔），回到主選單：線上頁顯示線上角色的存檔時間；切到單機頁，「繼續遊戲」仍是本機的進度（沒有被線上覆蓋）。
5. 換一個瀏覽器用同一個 Google 帳號登入，進入線上世界：接上同一個線上角色。
6. 兩個分頁同時進入同一帳號、兩邊都存檔：較晚存的那一邊出現「這個線上角色在別的地方存過檔了」，不會覆蓋。

查看線上角色（只讀，SQL）：`select user_id, revision, saved_at, play_time from public.characters;`

## 已知限制

- 遊戲伺服器還不驗證帳號（Supabase JWT）：連線名稱由客戶端帶上；禁言（`profiles.muted_until`）還沒有作用。
- 線上存檔由客戶端寫入（RLS 只允許本人），防作弊要改成伺服器驗證後代寫。
- 同一個人的 Google 與 LINE 只有信箱相同時才會是同一個帳號；還沒有手動綁定第二種登入方式的畫面。
- 線上角色目前只有一格（`slot` 1）；資料表預留到 3。
