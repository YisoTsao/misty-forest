# 上線與多人連線計劃書（草案，2026-10-14）

> 目標：先上網頁版（Vercel），同時維持桌面版（Electron），之後加入多人連線。資料庫用 Supabase。
> 本文件是規劃，不是規格；定案的部分要寫進 `GAME_DESIGN.md` 與 `DECISIONS.md`。
> 各服務的免費額度與條款會變動，以下數字查於 2026-10，**採用前請再看一次官方頁面**。

---

## 1. 結論先講

| 問題 | 答案 |
|---|---|
| 網頁版放 Vercel 可以嗎？ | 可以。遊戲是 Vite 產出的靜態檔（目前 `dist` 約 32 MB），Vercel 只當 CDN 用就夠了。 |
| DB 用 Supabase 可以嗎？ | 可以。帳號（Auth）、雲端存檔、排行榜／好友等資料都適合。 |
| 多人連線需要另一個服務嗎？ | **需要（建議）**。Vercel Functions 從 2026-06 起有 WebSocket（公開測試版），但連線受函式執行時間限制（預設約 5 分鐘就會斷），而且同一個房間的玩家不保證連到同一個實例，不適合當遊戲伺服器。 |
| 那用什麼？ | 分兩步：**第一步用 Supabase Realtime**（免費、零伺服器）做「看得到其他玩家」；**第二步用 Cloudflare Durable Objects**（或一台 VPS 跑 Node）做有權威的合作房間（一起打怪、撿東西）。 |
| 可以全部免費嗎？ | 開發與小規模測試可以。正式商業營運要注意：**Vercel Hobby 方案限非商業用途**，有收費或廣告就要升 Pro（約 US$20／月／成員）；桌面版簽章也有固定費用（見 §7）。 |

---

## 2. 目前專案的起點（對多人有利的地方）

- **權威層已經分開**：所有會改變遊戲狀態的操作都經由 `authority.send(command)` → `game-core` 規則 → 事件（`LocalAuthority`）。`GAME_DESIGN.md` §9 已規劃 Phase 11 用 `RemoteAuthority` 取代，這是多人化最關鍵的一步，現在的架構已經支援。
- **game-core 是純函式**：同一份規則可以直接在伺服器（Node / Cloudflare Workers）上跑，不必重寫。
- **存檔有版本與遷移**（目前 v13）：搬到雲端時沿用同一份格式與遷移程式。
- **存檔儲存已抽象化**：`src/game/save/storages.ts` 有 Electron（IPC 寫檔）與網頁（IndexedDB）兩種，網頁版可以直接用；之後加一個 Supabase 雲端儲存即可。
- 需要注意：敵人 AI 現在在本機模擬（DECISIONS T-121 已註明「多人時改由伺服器判斷」）。

---

## 3. 整體架構

```
            ┌──────────── 玩家 ────────────┐
            │  網頁（瀏覽器）   桌面（Electron） │  ← 同一份 React/R3F 程式碼
            └──────┬───────────────┬──────┘
                   │HTTPS          │WebSocket
   ┌───────────────▼───┐   ┌───────▼─────────────────────┐
   │ Vercel（靜態網站）  │   │ 多人伺服器                    │
   │ index.html / JS /  │   │ 階段 A：Supabase Realtime      │
   │ GLB / 音效（CDN）   │   │ 階段 B：Cloudflare Durable     │
   └───────────────────┘   │        Objects（每個房間一個）   │
                           └───────┬─────────────────────┘
                                   │ service key（只在伺服器）
                           ┌───────▼─────────────────────┐
                           │ Supabase                     │
                           │ Auth、Postgres（存檔、角色、    │
                           │ 好友、房間紀錄）、Storage        │
                           └─────────────────────────────┘
```

---

## 4. 各服務的角色與免費額度

### 4.1 Vercel（網頁版前端）
- 用途：放 `pnpm build:web` 的產物、自訂網域、HTTPS、每個 PR 的預覽網址。
- 設定：Framework 選 Vite，輸出 `dist`；`/assets/*`、模型、音效設長效快取（檔名有 hash）。
- 限制：Hobby 方案**非商業用途**、每月流量有上限。遊戲一次載入二十幾 MB，假設每位玩家第一次載入 25 MB，1 萬次載入就是約 250 GB，可能超過免費流量 → 先做資產壓縮（§6.2），必要時把大型資產移到 Cloudflare R2（出站流量免費）或 Supabase Storage。
- **不建議**把遊戲伺服器放在 Vercel Functions：WebSocket 仍是公開測試版，連線約 5 分鐘會被切斷，也沒有「同一房間連到同一實例」的保證。

### 4.2 Supabase（帳號與資料）
- **Auth**：Email 魔法連結＋Google／Discord 登入；網頁與 Electron 共用（Electron 用 deep link 或系統瀏覽器完成 OAuth）。
- **Postgres**：資料表草案見 §5。全部開 **RLS**（Row Level Security），玩家只能讀寫自己的資料。
- **Realtime**：Free 方案約 200 個同時連線、每秒 100 則訊息、Presence 每秒 20 則。夠做 Beta 測試的「看得到其他玩家」，不夠做正式的大量同步。
- 注意：Free 專案**7 天沒有活動會暫停**；正式上線前改 Pro（約 US$25／月）或至少設定定期請求。

### 4.3 多人伺服器
| 選項 | 費用 | 適合 | 缺點 |
|---|---|---|---|
| **Supabase Realtime**（Broadcast＋Presence） | 免費額度內 0 元 | 階段 A：看到彼此走動、表情、聊天 | 沒有伺服器權威（可作弊）、限流嚴、不適合同步戰鬥 |
| **Cloudflare Durable Objects**（推薦階段 B） | Workers Free 每天 10 萬次請求；WebSocket 進來的訊息 20 則算 1 次；用 Hibernation API 閒置不計時 | 每個房間一個物件、單執行緒天然權威、全球邊緣節點、免維運 | 要用 Workers 的寫法（但 game-core 是純 TS，可直接打包）；超量後按用量計費 |
| Node＋Colyseus／Socket.IO 放在 VPS（Hetzner、Oracle Always Free、Fly.io） | 0–5 美元／月起 | 想用最熟悉的 Node、需要長時間模擬 | 自己維運、擴充、更新與監控 |
| Render／Railway 免費方案 | 免費或少量點數 | 試做 | 免費機器閒置會休眠，不適合常駐 WebSocket |

> 原規格寫的 Socket.IO 仍可用（Durable Objects 用原生 WebSocket，VPS 方案可用 Socket.IO），差別只在傳輸層，`RemoteAuthority` 的介面不變。

---

## 5. 資料設計（Supabase）

```sql
-- 玩家檔案
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  created_at timestamptz default now()
);

-- 雲端存檔：沿用 game-core 的存檔 JSON（含 version），伺服器端也跑遷移
create table saves (
  user_id uuid references auth.users on delete cascade,
  slot text not null,
  version int not null,
  data jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, slot)
);
alter table saves enable row level security;
create policy "own saves" on saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 多人房間（階段 B）：房間本身的即時狀態在 Durable Object，DB 只存紀錄與邀請
create table rooms (
  id text primary key,
  host uuid references auth.users,
  map text not null,
  created_at timestamptz default now(),
  closed_at timestamptz
);
```

- 單人模式的雲端存檔：本機存檔為主、雲端為備份；衝突時以 `updated_at` 較新者為準並保留另一份（存檔可靠性在 §8 是「不可砍」）。
- 多人模式的角色資料（背包、任務）由伺服器寫入，用 service role key，**這把 key 只放在伺服器，不能進前端或 Electron**。

---

## 6. 網頁版需要做的事

### 6.1 平台差異
| 項目 | Electron | 網頁 |
|---|---|---|
| 存檔 | IPC 寫檔（已有） | IndexedDB（已有）＋雲端同步（新增） |
| 視窗／全螢幕 | 主程序控制 | Fullscreen API，需要使用者操作才能進入 |
| 滑鼠鎖定 | 已有 | Pointer Lock，首次需要點擊（已有「點擊畫面鎖定滑鼠」流程） |
| 音效 | 已在第一次操作時解鎖 | 同上 |
| 除錯面板 | `?debug` | 正式網址不要帶 `debug`；除錯指令已經以 `import.meta.env.DEV \|\| ?debug` 控制，上線前改成只在開發版生效 |

### 6.2 載入效能（網頁版的關鍵）
1. GLB 用 **meshopt 或 Draco** 壓縮、貼圖轉 **KTX2**，目標首次下載 < 15 MB。
2. 分批載入：先載入出生地與 UI，螢苔祕林等第二張地圖進入時才載入。
3. 載入畫面顯示進度；首次載入後交給瀏覽器快取（資產檔名帶 hash）。
4. 低階裝置預設低畫質；偵測不支援 WebGL2 時顯示說明頁。
5. 本次已加入的 shader 預熱（`ShaderWarmup`）在網頁版一樣有效，避免邊走邊卡。

### 6.3 部署流程
- GitHub `main` → Vercel Production；PR → Preview 網址（給測試者試玩）。
- CI（GitHub Actions）：`pnpm check`、`pnpm build`，e2e 在本機或自架 runner 跑（需要 GPU 與 Electron）。

---

## 7. 桌面版（Electron）發行
| 項目 | 做法 | 費用 |
|---|---|---|
| 打包 | `electron-builder`（已設定） | — |
| macOS 簽章與公證 | Apple Developer Program，不簽會被 Gatekeeper 擋 | 約 US$99／年 |
| Windows 簽章 | Azure Trusted Signing 或 OV 憑證，不簽會出現 SmartScreen 警告 | 約 US$10／月起 |
| 自動更新 | `electron-updater`＋GitHub Releases | 免費 |
| Steam（之後） | Steamworks，自帶更新、成就、好友、多人配對 | 每款 US$100 |

網頁與桌面共用同一份程式碼與同一個 Supabase 專案，帳號與存檔互通。

---

## 8. 多人連線設計

### 8.1 先決定玩法（需要你決定，影響很大）
| 模式 | 說明 | 技術難度 |
|---|---|---|
| **A. 共享世界（輕社交）** | 同一張地圖看得到其他玩家走動、揮手、聊天；任務、戰鬥各自進行 | 低 |
| **B. 合作房間（建議主線）** | 2–4 人進同一個房間，一起打怪、解謎、共享任務進度；房主的世界 | 中 |
| C. 大型持久世界（MMO） | 所有人同一個世界，伺服器長期運作 | 高，不建議 |

建議：**A 先做（驗證連線與帳號），B 是正式的多人模式**，C 不做。這也符合 `GAME_DESIGN.md` 的「單人完整、多人加成」。

### 8.2 同步原則
- **自己的角色**：本機預測移動（手感不變），每秒 10–15 次送出位置／朝向／動畫給伺服器。
- **其他玩家**：插值顯示（延遲約 100 ms 的平滑移動），不做物理模擬。
- **權威事項**由伺服器判定：傷害、掉落、撿取、任務進度、機關（水道閘門）、敵人 AI 與生成。也就是把現在的 `LocalAuthority` 搬到伺服器，用戶端換成 `RemoteAuthority`（送出指令、接收事件）。
- **興趣範圍**：只同步同一張地圖、一定距離內的玩家與敵人。
- **斷線**：自動重連，重連後伺服器送完整狀態快照，再接續事件。
- **防作弊**：伺服器檢查移動速度上限、攻擊距離與冷卻（規則已在 game-core）。

### 8.3 訊息量估算（判斷免費額度夠不夠）
- 階段 A：每位玩家每秒 10 則位置訊息。Supabase Free 每秒上限 100 則 → 約 **8–10 人同時在線**就到上限。只適合封閉測試。
- 階段 B（Durable Objects）：4 人房間每秒約 40 則進來的訊息；20 則算 1 次請求 → 每小時約 7,200 次。Free 每天 10 萬次 → 約可跑 **14 房間‧小時／天**。超過後付費方案每月 US$5 起，用量計費很低。

---

## 9. 路線圖（每一項都是可單獨驗收的任務）

| 階段 | 任務 | 驗收 |
|---|---|---|
| **W1 網頁版上線** | Vercel 專案、正式網址、除錯指令只在開發版、WebGL2 檢查頁 | 正式網址可從主選單玩到螢苔祕林；`?debug` 無效 |
| W2 資產壓縮與分批載入 | meshopt／KTX2、第二張地圖延後載入、載入進度條 | 首次下載 < 15 MB；冷啟動時間記錄在 `PERF.md` |
| W3 帳號 | Supabase Auth（Email＋Google）、profiles、Electron 的 OAuth 回呼 | 網頁與桌面用同一個帳號登入 |
| W4 雲端存檔 | `SupabaseStorage`、同步與衝突處理、RLS | 在網頁存檔 → 桌面讀到同一份；RLS 測試：讀不到別人的存檔 |
| D1 桌面發行 | macOS 簽章＋公證、Windows 簽章、自動更新 | 兩平台安裝不出現警告，能自動更新 |
| **M1 共享世界（模式 A）** | Supabase Realtime：同地圖的其他玩家（Presence＋Broadcast）、名牌、表情 | 兩個視窗互相看到對方平滑移動 |
| M2 `RemoteAuthority` 介面 | 抽出權威介面、指令／事件序列化、單人仍用 `LocalAuthority` | 所有既有 e2e 不變綠燈 |
| M3 房間伺服器 | Cloudflare Durable Object 跑 game-core 規則、加入／離開、快照與重連 | 兩人同房間：一人撿走的東西另一人看到消失 |
| M4 合作戰鬥 | 敵人 AI 與生成搬到伺服器、傷害與掉落由伺服器判定 | 兩人一起打同一隻怪，血量與掉落一致 |
| M5 合作任務與機關 | 任務進度與水道機關共享 | 兩人一起完成「把水還給森林」 |
| M6 上線準備 | 監控（錯誤回報、連線數）、限流、檢舉與封鎖、隱私權政策 | 壓力測試 20 房間無錯誤 |

時程估計（以目前的開發速度）：W1–W4 約 1–2 週、D1 取決於申請簽章、M1 約 1 週、M2–M5 約 3–5 週。

---

## 10. 費用概估（每月）

| 階段 | Vercel | Supabase | 多人伺服器 | 其他 | 合計 |
|---|---|---|---|---|---|
| 開發／封閉測試 | Hobby 0 | Free 0 | Supabase Realtime 0 | — | **0** |
| 公開 Beta（非商業） | Hobby 0 | Free 0（注意 7 天暫停） | Cloudflare Workers Free 0 | 網域約 US$1 | **約 US$1** |
| 正式上線（商業） | Pro 約 20 | Pro 約 25 | Workers Paid 約 5 起 | Apple 99／年、Windows 簽章約 10 | **約 US$60–70** |

---

## 11. 待決定事項
1. 多人玩法：模式 A＋B（建議）還是只做 A？房間人數上限？
2. 有沒有商業化（收費、廣告、贊助）？決定 Vercel 能不能維持 Hobby。
3. 登入方式：Email＋Google 是否足夠？要不要 Discord／Apple？
4. 網頁版要不要支援手機／平板（需要觸控操作，工作量大，建議之後再說）。
5. 自訂網域名稱。

---

## 參考資料（2026-10 查詢）
- Vercel Functions WebSocket（公開測試版）：https://vercel.com/docs/functions/websockets 、https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections
- Vercel WebSocket 實測（約 5 分鐘斷線）：https://dev.classmethod.jp/en/articles/vercel-functions-websocket-public-beta-verification/
- Supabase Realtime 限制：https://supabase.com/docs/guides/realtime/limits
- Cloudflare Durable Objects 價格：https://developers.cloudflare.com/durable-objects/platform/pricing
