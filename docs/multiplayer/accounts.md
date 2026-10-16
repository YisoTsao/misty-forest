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

## 設定（一次性，需要在 Supabase 後台做）

1. **驗證碼信件要包含 `{{ .Token }}`**：Authentication → Email Templates → **Magic Link**（與 Confirm signup 也建議一起改）。預設範本只有 `{{ .ConfirmationURL }}`（連結），沒有數字碼，玩家收不到可以輸入的驗證碼。範例內容：
   ```html
   <h2>迷霧之森 登入驗證碼</h2>
   <p>你的 6 位數驗證碼：</p>
   <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
   <p>驗證碼 10 分鐘內有效。如果不是你要求的，可以忽略這封信。</p>
   ```
2. **Authentication → URL Configuration → Site URL** 設為 `https://mistwood-blue.vercel.app`（OTP 不跳轉，但之後的連結類信件需要）。
3. **寄信**：目前用 Supabase 內建寄信（每小時寄送數量有限，兩三個人測試足夠）。之後改用 Resend：Authentication → SMTP Settings 填 Resend 的 SMTP 資料（host `smtp.resend.com`、port 465、user `resend`、password 為 Resend 的 API key），寄件網域需先在 Resend 驗證。**API key 只填在 Supabase 後台，不要貼進對話或程式碼。**
4. 之後若要限制註冊（例如只給邀請的人），在 Authentication → Sign In / Providers → Email 關閉「Allow new users to sign up」，但 `signInWithOtp` 會對新信箱建立帳號，那時要改成 `shouldCreateUser: false` 並先建立帳號。

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
- 寄信額度有限（內建寄信）。
- 只同步主存檔一格；`saves` 表的結構允許之後加格位，但目前沒有。
