# 線上資料庫（任務 11L-1）

線上模式的資料表、權限與管理方式。決策見 `docs/DECISIONS.md` T-179；平台設定見 `docs/PLATFORMS.md`。

## 原則

- **線上一定要登入，資料只存在資料庫**；**單機只用本機存檔**，兩者互不同步（取代 T-178 的「登入後同步本機存檔」）。
- 客戶端（遊戲與之後的後台網頁）只用 publishable key + 使用者自己的 JWT，所有權限由 **RLS** 決定。不在任何客戶端放 secret key。
- 角色（`profiles.role`）：
  - `player`：一般玩家。
  - `gm`：營運人員。處理檢舉、禁言 / 停權、發公告、寄信；可讀所有玩家資料，**不能**改玩家存檔、改角色、改遊戲設定。
  - `admin`：全部權限，含修改玩家存檔、刪除角色、遊戲設定、讀稽核紀錄、指派角色。
- 判斷角色的函式（`private.is_staff()`、`is_admin()`、`is_banned()`）放在 `private` schema，不經 API 對外公開，只給 RLS 政策呼叫。
- gm / admin 的每一次新增、修改、刪除，由觸發器自動寫進 `admin_audit_log`（不依賴後台前端記錄）。

## Migration

| 檔案 | 內容 |
|---|---|
| （未在 repo）`cloud_saves` | 任務 11G 的 `saves` 表，以 MCP 直接套用 |
| `supabase/migrations/20261017090000_online_core.sql` | 本任務的所有資料表、函式、觸發器、RLS |
| `supabase/migrations/20261017091000_online_core_tuning.sql` | 依 Supabase advisor 調整：`claim_mail` 改 invoker、合併政策、外鍵索引 |

TypeScript 型別：`src/account/database.types.ts`（資料表變更後重新產生）。

## 資料表

| 資料表 | 用途 | 玩家 | gm | admin | 未登入 |
|---|---|---|---|---|---|
| `profiles` | 每個帳號一列（註冊時自動建立）：顯示名稱、角色、停權、禁言、最後上線 | 讀自己；只能改 `display_name` | 讀全部；改停權 / 禁言 | 全部；改角色 | ✗ |
| `characters` | 線上角色存檔（`save` 與本機存檔同格式），`slot` 1–3（目前只用 1） | 讀寫自己的（停權中不能寫）；不能刪 | 讀全部 | 讀寫刪全部 | ✗ |
| `game_config` | 單列：維護模式、維護訊息、最低客戶端版本、標題訊息 | 讀 | 讀 | 讀寫 | 讀 |
| `announcements` | 公告（news / update / event / maintenance），可設發佈期間、置頂 | 讀已發佈且在期間內的 | 讀寫全部（含草稿） | 同 gm | 讀已發佈 |
| `mail` | 玩家信箱：系統信、補償、活動獎勵（附件最多 10 項） | 讀自己的；只能標記已讀；以 `claim_mail()` 領附件 | 寄送、修改、刪除 | 同 gm | ✗ |
| `chat_reports` | 玩家檢舉（spam / abuse / cheating / inappropriate_name / other） | 建立、讀自己的 | 讀全部、處理 | 同 gm | ✗ |
| `moderation_actions` | 處分歷史（warn / mute / unmute / ban / unban / note）；目前狀態在 `profiles` | ✗ | 讀、新增 | 同 gm | ✗ |
| `player_sessions` | 線上遊玩紀錄（活躍人數統計），同時更新 `profiles.last_seen_at` | 建立、更新自己的 `last_seen_at` / `ended_at` | 讀全部 | 同 gm | ✗ |
| `admin_audit_log` | 後台操作紀錄（觸發器寫入，任何人都不能直接寫） | ✗ | ✗ | 讀 | ✗ |
| `saves` | **舊表（任務 11G）**，本機存檔的雲端鏡像。資料已複製到 `characters`，之後確認不需要再移除 | 讀寫自己的 | — | — | ✗ |

### 重要規則（由觸發器保證）

- **存檔版本號**：`characters.revision` 每次更新自動 +1，客戶端不能指定。存檔時用 `update ... where id = ? and revision = 讀到的值`，更新 0 筆就代表別的分頁或裝置已經存過，要重新讀取，不能直接覆蓋。
- **存檔大小**：`save` 必須是 JSON 物件且不超過 512 KB（目前約 2.6 KB）。
- **profiles**：一般玩家改角色、停權、禁言欄位會被拒絕；只有 admin 能改 `role`。顯示名稱 2–16 字、前後不能有空白、不分大小寫不能重複。
- **mail**：玩家只能改 `read_at`；附件只能透過 `claim_mail(p_mail_id)` 領取（未領過、未過期、本人、未停權），回傳附件陣列，由客戶端加進背包後存檔。
- **chat_reports**：玩家只能建立 `status = open` 的檢舉，不能自己結案。
- **停權**：`status = banned` 且 `banned_until` 為空（永久）或在未來時，不能建立或寫入角色。到期自動失效（不需要排程）。

## 管理

### 指定管理員

後台還沒做之前，用 Supabase 後台的 SQL Editor（以 postgres 身分執行，不受觸發器限制）：

```sql
update public.profiles
   set role = 'admin'   -- 或 'gm'
 where id = (select id from auth.users where email = '你的信箱');
```

### 權限測試

`online_core` 套用後以 SQL 模擬玩家 A / B、gm、admin、未登入五種身分，共 42 項（讀寫範圍、欄位保護、revision、信件領取、停權、稽核紀錄），全部符合預期。測試在單一交易中執行並以例外結束，資料全部回滾，正式資料庫沒有留下測試資料。之後修改政策時用同樣方式重測。

### 已知限制與之後的工作

- **存檔由客戶端寫入**：玩家理論上可以改自己的存檔（例如背包數量）。防作弊要改成遊戲伺服器驗證後以 secret key 寫入（伺服器驗證 Supabase JWT 的工作在 online-plan.md 的 11G 項目內，尚未做）。
- **檢舉的 `reported_user_id`**：遊戲伺服器的玩家 id 還不是帳號 id，目前只能記名稱；伺服器改用帳號後補上。
- **禁言**：`profiles.muted_until` 已有欄位，遊戲伺服器還沒有讀取（同上，需要伺服器驗證 JWT）。
- **維護模式與最低版本**：`game_config` 已有欄位，前端還沒有讀取（下一個任務：線上入口）。
- **檢舉頻率**：資料庫沒有限制玩家檢舉的次數，之後視情況加上。
