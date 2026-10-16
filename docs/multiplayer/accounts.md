# 帳號與雲端存檔（任務 11G）

Email 驗證碼登入（6 位數，不用魔法連結）與主存檔的雲端同步。實作：`src/account/`（登入、同步、雲端讀寫）、`src/game-core/save/sync.ts`（同步判斷，純函式）、`src/ui/AccountPanel.tsx`（畫面）。決策見 `docs/DECISIONS.md` T-178。

## 資料

- 專案：Supabase `mistwood`（ref `dnnlmunlmmhiqpgkjbvr`，新加坡），publishable key 公開，會打包進網頁與 Electron；**沒有** secret key 進客戶端。
- 資料表 `public.saves`：每個帳號一列（`user_id` 對應 `auth.users`），`data` 是本機主存檔的 JSON，`saved_at` 是存檔時間（同步時用來判斷是不是同一版）。RLS：只能讀寫自己的列，`anon` 完全不能讀寫。Security advisor 無警告。
- 只同步主存檔（`slot1`）；設定（`settings`）維持本機。

## 行為

- 登入只在**標題畫面**進行。遊戲中可以登出，但不能登入，避免用雲端存檔覆蓋正在進行的進度。
- 登入後（標題畫面）比對一次：只有本機 → 上傳；只有雲端 → 下載；兩邊相同 → 不動；**兩邊不同版 → 問玩家選哪一份**（不自動選較新的）。
- 登入中，每次本機存檔後同一份內容會上傳到雲端（依序排隊；失敗只顯示「同步失敗」，本機存檔不受影響，下次存檔會再試）。
- 沒有設定 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` 時帳號功能停用（e2e 建置就是這樣），單機完全不受影響。

## 設定（一次性）

寄信使用 **Resend**（SMTP），由 Supabase 後台設定；程式碼不需要改，也不會碰到 Resend 的 API key。

### A. Resend（resend.com）

1. 註冊／登入 Resend，建立一個專案（或使用現有的）。
2. **Domains → Add Domain**：輸入你的網域（例如 `mistwood.example`）。Resend 會給出幾筆 DNS 記錄（SPF、DKIM，有的還有 MX），到網域的 DNS 管理處新增，然後在 Resend 按 **Verify**，狀態變成 Verified 才能寄出。
   - 還沒有網域可以先用 Resend 提供的測試寄件者 `onboarding@resend.dev`，但它**只能寄到你註冊 Resend 的那個信箱**，正式上線前要換成自己的網域。
3. **API Keys → Create API Key**：權限選 **Sending access**，可以限定網域。建立後會只顯示一次，複製起來。**這把 key 只貼到 Supabase 後台的密碼欄位，不要貼到對話、程式碼或文件裡。**

### B. Supabase 後台（dashboard.supabase.com → 專案 mistwood）

4. **Authentication → SMTP Settings**，開啟 **Enable Custom SMTP**，填入：

   | 欄位 | 值 |
   |---|---|
   | Sender email | 已驗證網域的寄件者，例如 `noreply@mistwood.example`（測試時 `onboarding@resend.dev`） |
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

7. **Authentication → URL Configuration → Site URL**：設為 `https://mistwood-blue.vercel.app`。

### C. 測試

8. 開 https://mistwood-blue.vercel.app → 標題畫面「帳號」→ 輸入信箱 → 寄送驗證碼。
9. 確認信件寄件者是你設定的網域、內容是 6 位數字；輸入後顯示「已登入」。
10. 到 Resend 後台 **Emails** 頁面，應該看得到這封信的紀錄；若沒有，表示 SMTP 設定有誤，看 Supabase **Logs → Auth** 的錯誤訊息。

### 常見問題

- 信件沒有寄出、Resend 沒有紀錄：SMTP 的 Host、Port、Username（必須是 `resend`）或 API key 有誤。
- 寄件者被拒絕：寄件網域還沒在 Resend 驗證，或寄件者不是該網域的地址。
- 收到信但沒有數字：Magic Link 或 Confirm signup 範本還沒加 `{{ .Token }}`。第一次登入的信箱用的是 Confirm signup。
- 收到的是「Confirm your email」連結信：不要點連結（遊戲只用驗證碼），改好 Confirm signup 範本後在帳號面板按「換一個信箱」重新寄送（同一信箱 60 秒內只能寄一次）。
- 測試時寄到非註冊信箱失敗：仍在用 `onboarding@resend.dev`，改用已驗證的網域。

## Vercel 環境變數（已設定）

`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`（Production 與 Preview）。CSP 的 `connect-src` 由 `vite.config.ts` 的 `supabaseCsp` 依 `VITE_SUPABASE_URL` 加入。

## 手動測試（需要真的信箱）

1. 開 https://mistwood-blue.vercel.app，標題畫面按「帳號」，輸入信箱，按「寄送驗證碼」。
2. 收信，輸入 6 位數，按「登入」。畫面顯示「已登入：信箱」。
3. 在標題畫面建立或保留一份存檔，遊玩後存檔（會上傳）。
4. 換一個瀏覽器（或無痕視窗）登入同一信箱，標題畫面應該自動比對；本機沒有存檔時會直接下載雲端的存檔，「繼續遊戲」可以接上。
5. 兩邊都有不同的存檔時，應出現「本機與雲端的存檔不同」對話框，選一份後另一份被覆蓋。

查看雲端列（只讀，SQL）：`select user_id, saved_at, updated_at from public.saves;`

## 已知限制

- 遊戲伺服器還不驗證帳號（Supabase JWT）。帳號目前只用於存檔；聊天的靜音、封鎖與檢舉要改成帳號層級時再接（登入後伺服器驗證 JWT 的工作留到那一步）。
- 寄信走 Resend：免費方案每月 3000 封、每日 100 封（依 Resend 目前的方案為準）。
- 只同步主存檔一格；`saves` 表的結構允許之後加格位，但目前沒有。
