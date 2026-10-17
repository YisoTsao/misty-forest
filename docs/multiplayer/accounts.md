# 帳號與線上登入（任務 11G、11L-2）

Email 驗證碼登入（6–8 位數，不用魔法連結），只用於**線上遊玩**。實作：`src/account/`（登入）、`src/online/`（玩家檔案、線上角色、遊玩紀錄）、`src/ui/OnlinePanel.tsx`（主選單的線上頁）。決策見 `docs/DECISIONS.md` T-178（登入方式）、T-179、T-180（單機與線上分開）；畫面流程見 `ui-flow.md`；資料表見 `database.md`。

## 資料

- 專案：Supabase `mistwood`（ref `dnnlmunlmmhiqpgkjbvr`，新加坡），publishable key 公開，會打包進網頁與 Electron；**沒有** secret key 進客戶端。
- 線上角色存在 `public.characters`，玩家檔案在 `public.profiles`（說明見 `database.md`）。
- 舊表 `public.saves`（11G 的本機存檔鏡像）已不再使用，資料已複製成線上角色，之後確認再移除。

## 行為

- 登入只在主選單的「線上遊玩」頁進行；驗證碼通過後直接成為已登入（不需要再按按鈕），接著讀取玩家檔案與線上角色。
- 第一次進入線上要先取顯示名稱（2–16 字、不分大小寫不能重複、不能含屏蔽詞）。
- **單機存檔不會上傳，線上角色不會寫到本機**（取代 11G 的同步與衝突對話框）。
- 線上的一局每次存檔寫入 `characters`，以 `revision` 檢查：別的分頁或裝置已存過時不覆蓋，提示玩家回到主選單重新進入。
- 沒有設定 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` 時線上頁顯示停用提示（e2e 建置就是這樣），單機完全不受影響。

## 設定（一次性）

寄信使用 **Resend**（SMTP），由 Supabase 後台設定；程式碼不需要改，也不會碰到 Resend 的 API key。

### A. Resend（resend.com）

1. 註冊／登入 Resend，建立一個專案（或使用現有的）。
2. **Domains → Add Domain**：輸入你的網域（例如 `yisoapp.com`）。Resend 會給出幾筆 DNS 記錄（SPF、DKIM，有的還有 MX），到網域的 DNS 管理處新增，然後在 Resend 按 **Verify**，狀態變成 Verified 才能寄出。
   - 還沒有網域可以先用 Resend 提供的測試寄件者 `onboarding@resend.dev`，但它**只能寄到你註冊 Resend 的那個信箱**，正式上線前要換成自己的網域。
3. **API Keys → Create API Key**：權限選 **Sending access**，可以限定網域。建立後會只顯示一次，複製起來。**這把 key 只貼到 Supabase 後台的密碼欄位，不要貼到對話、程式碼或文件裡。**

### B. Supabase 後台（dashboard.supabase.com → 專案 mistwood）

4. **Authentication → SMTP Settings**，開啟 **Enable Custom SMTP**，填入：

   | 欄位 | 值 |
   |---|---|
   | Sender email | 已驗證網域的寄件者，例如 `noreply@yisoapp.com`（測試時 `onboarding@resend.dev`） |
   | Sender name | `迷霧之森` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | 第 3 步的 API key |

   按 **Save**。

5. **Authentication → Rate Limits**：自訂 SMTP 後可以把「Emails sent per hour」調高（內建寄信只有很少的額度，改成 Resend 後才需要調）。依測試人數設定，例如 30。

6. **Authentication → Email Templates**：**Magic Link 與 Confirm signup 兩份都要改**，內容一定要包含 `{{ .Token }}`（6 位數驗證碼），否則信件只有連結、玩家輸入不了。第一次登入的信箱（帳號還不存在）Supabase 寄的是 **Confirm signup**，之後的登入才寄 **Magic Link**；只改 Magic Link 時，新玩家收到的會是預設的「Confirm your email」連結信（2026-10-16 使用者實際收到的信）。兩份用同樣的內容：

   ```html
   <h2>迷霧之森 登入驗證碼</h2>
   <p>你的 6 位數驗證碼：</p>
   <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>驗證碼 10 分鐘內有效。如果不是你要求的，可以忽略這封信。</p>
   ```

7a. **Authentication → Sign In / Providers → Email → Email OTP Length**：預設可能是 8 位。程式已接受 6 到 8 位（以 Supabase 實際寄出的為準），所以不改也能用；若想統一成 6 位，改成 6 並按 Save。改了之後舊信件的驗證碼就失效，要重新寄送。
7. **Authentication → URL Configuration → Site URL**：設為 `https://mistwood.yisoapp.com`；Redirect URLs 也加入同一網址。

### C. 測試

8. 開 https://mistwood.yisoapp.com → 主選單「線上遊玩」→ 輸入信箱 → 寄送驗證碼。
9. 確認信件寄件者是你設定的網域、內容是 6 位數字；輸入後顯示「已登入」。
10. 到 Resend 後台 **Emails** 頁面，應該看得到這封信的紀錄；若沒有，表示 SMTP 設定有誤，看 Supabase **Logs → Auth** 的錯誤訊息。

### 常見問題

- 信件沒有寄出、Resend 沒有紀錄：SMTP 的 Host、Port、Username（必須是 `resend`）或 API key 有誤。
- 寄件者被拒絕：寄件網域還沒在 Resend 驗證，或寄件者不是該網域的地址。
- 收到信但沒有數字：Magic Link 或 Confirm signup 範本還沒加 `{{ .Token }}`。第一次登入的信箱用的是 Confirm signup。
- 收到的是「Confirm your email」連結信：不要點連結（遊戲只用驗證碼），改好 Confirm signup 範本後在線上頁按「換一個信箱」重新寄送（同一信箱 60 秒內只能寄一次）。
- 測試時寄到非註冊信箱失敗：仍在用 `onboarding@resend.dev`，改用已驗證的網域。

## Vercel 環境變數（已設定）

`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`（Production 與 Preview）。CSP 的 `connect-src` 由 `vite.config.ts` 的 `supabaseCsp` 依 `VITE_SUPABASE_URL` 加入。

## 手動測試（需要真的信箱）

1. 開 https://mistwood.yisoapp.com，主選單切到「線上遊玩」，輸入信箱，按「寄送驗證碼」。
2. 收信，輸入驗證碼，按「登入」：畫面直接變成「已登入」，並要求取名（第一次）。
3. 取名後按「進入線上世界」：沒有線上角色時從頭開始，暫停選單顯示「線上遊玩 · 名稱」，右上角連線狀態變成已連線。
4. 遊玩後存檔（暫停選單「儲存遊戲」或等自動存檔），回到主選單：線上頁顯示線上角色的存檔時間；切到單機頁，「繼續遊戲」仍是本機的進度（沒有被線上覆蓋）。
5. 換一個瀏覽器登入同一信箱，進入線上世界：接上同一個線上角色。
6. 兩個分頁同時進入同一帳號、兩邊都存檔：較晚存的那一邊出現「這個線上角色在別的地方存過檔了」，不會覆蓋。

查看線上角色（只讀，SQL）：`select user_id, revision, saved_at, play_time from public.characters;`

## 已知限制

- 遊戲伺服器還不驗證帳號（Supabase JWT）：連線名稱由客戶端帶上；禁言（`profiles.muted_until`）還沒有作用。
- 線上存檔由客戶端寫入（RLS 只允許本人），防作弊要改成伺服器驗證後代寫。
- 寄信走 Resend：免費方案每月 3000 封、每日 100 封（依 Resend 目前的方案為準）。
- 線上角色目前只有一格（`slot` 1）；資料表預留到 3。
