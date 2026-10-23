# 開發進度

## 目前階段
**第二章改版（2026-10-20，使用者指示，DECISIONS T-185、T-186）：螢苔祕林改依 `docs/CHAPTER_02_GLOWMOSS_WOOD_SPEC.md` 重做，現有內容都算第一章。設計文件已改完（Bible §6、GAME_DESIGN §2.2 / §2.3 / §9）；程式還是 Phase 8 的舊版。Phase 0 盤點完成（`docs/chapter02/PHASE0_INVENTORY.md`），使用者確認 §6 四項都採用建議（T-187）。Phase 1 垂直切片（任務 12A–12E）在分支 `wip/ch2-glowmoss` 進行：**12A–12E 完成，第二章 Phase 1 垂直切片完成（待使用者驗收；見下方 12E 的未做項）**（移除舊版祕林、存檔 v18；新地形與 A 迷霧入口、B 螢苔花園、存檔 v19；第一座星光燈柱、純淨螢苔與採集點；螢苔史萊姆；莉露與 `quest_forest_001`）。**下一步：Phase 2（倒流溪谷、蘑菇居民聚落、主要 NPC 與商店、裝備流程），見 `docs/CHAPTER_02_GLOWMOSS_WOOD_SPEC.md` §15。**

**Phase 11 多人連線（使用者指示提前開始，依〈3D RPG 多人連線技術規劃〉文件，DECISIONS T-166–T-171）：任務 11A（Colyseus 伺服器與連線骨架）、11B（移動同步）、11C（斷線續玩）、11D（部署：Vercel + Render 上線，2026-10-15 使用者以兩個瀏覽器在正式網址驗收連線成功）、11E（攻擊與施法的同步）、11F（聊天）完成。正式網址 https://mistwood-blue.vercel.app。路線圖（使用者 2026-10-16 決定）：聊天 → 登入與雲端存檔（11G）→ 日光與資源共享 → 怪物共享 → 手機版（先做能玩）。** **任務 9F 風語草原（地圖四，Bible §8）的地圖與場景完成（2026-10-15）；草原的居民、怪物與任務（`quest_meadow_001`–`003`）還沒開始。** **Phase 9 澄鏡湖（Bible §7）開始：任務 9A（地圖與場景）、9B（湖區怪物）、9C（伊芙與「湖面不肯忘記」）、9D（水鏡光路謎題）、9E-1（頭目璃漪）、9E-2（潮之共鳴）完成，Phase 9 澄鏡湖的主線完成。Phase 8 螢苔祕林（Bible §6）完成：任務 8A（地圖切換與場景）、8B（森林怪物）、8C（琳娜 / 奇奇與水道謎題）、8D-1（頭目苔咚的戰鬥）、8D-2（苔冠下的守衛與芽之共鳴）。Phase 7 晨曦谷地 MVP：任務 7D「燈塔的最後一盞光」、7E「霧團噗啾王」、7F「任務日誌」、7G「郵袋裡的三封信」、7H「米菈的雜貨補給」、7I「使用消耗品」、7J「製作（琳娜的草藥桌）」、7K「花園第一顆種子」、7L「河邊的腳印」、7M「燈塔下的影子」、7N「村屋窗燈」、7O「找到回家的路」、7P「動物居民」完成。Phase 7 晨曦谷地的任務 `quest_dawn_001`–`007` 都已完成，下一步見「下一步」。** Phase 7（擴大地圖、世界地圖與小地圖、場景豐富化、多樣怪物）7A–7C 已完成。 Phase 6 任務 6A–6F 已完成；任務 5E（效能與發行）與 Phase 5、6 驗收延後。規格 v3（`GAME_DESIGN.md`）已取代 `mistwood_dev_spec_final.md`，整合 World Bible v2。Phase 4、Phase 2 已通過驗收（見下方）。
Phase 1 已依使用者指示視為通過（DECISIONS P-01）；風格參考圖比對與 B 級機器量測仍待使用者，見「待使用者處理」。

**續作從這裡開始**：讀完本檔「下一步」與「已知問題」。

**交接（2026-10-15，多人連線）**：使用者要求先做多人連線，任務 11A–11B 已完成並提交到 `develop`（見「已完成」）。多人連線的執行方式、協定與測試見 `docs/multiplayer/`。
- **已上線（任務 11D）**：前端 https://mistwood-blue.vercel.app（Vercel 專案 `mistwood`，團隊 `yisotsaos-projects`，`mistwood.vercel.app` 是別人的）、遊戲伺服器 https://mistwood-game-server.onrender.com（Render Free 新加坡，`ALLOWED_ORIGINS=https://mistwood-blue.vercel.app,https://mistwood-*-yisotsaos-projects.vercel.app,null,file://`）、Supabase 專案 `mistwood`（ref `dnnlmunlmmhiqpgkjbvr`，新加坡，還是空的）。`main` push 後 Vercel 與 Render 都自動部署。Vercel 的 MCP 工具建立專案回 403，改用使用者登入的 Vercel CLI（`npx vercel`；本機上傳部署 `vercel deploy` 被自動模式擋下，部署一律走 push `main`）。使用者 2026-10-15 在正式網址以兩個瀏覽器驗收：連線成功；回報攻擊與施法對方看不到 → 任務 11E。
- **下一步（使用者 2026-10-17 決定，優先）**：完整線上功能。11L-1 線上資料表已完成（T-179、`docs/multiplayer/database.md`）。11L-2 前台線上入口已完成（T-180、`docs/multiplayer/ui-flow.md`）。接著：遊戲中的信箱與公告 → 檢舉 → **簡易後台**（玩家查詢與停權 / 禁言、公告、寄信、檢舉處理、維護模式、稽核紀錄）→ 遊戲伺服器驗證 JWT（禁言、帳號層級的聊天）。使用者的帳號已是 `admin`。
- **原下一步**（使用者 2026-10-16 決定的順序，排在線上功能之後）：11G Supabase 登入（Email **6 位數驗證碼**，不用魔法連結；寄信用使用者已有的 Resend 當 Supabase 自訂 SMTP，設定步驟見 `docs/multiplayer/accounts.md`）與雲端存檔 → 11H 共享日光（先決定多人時暫停、睡覺、迷霧怎麼處理）→ 11I 共享採集點與寶箱 → 11J 共享怪物與傷害 → 11K 頭目戰 → 手機版（先做「能玩」：虛擬搖桿、拖曳轉視角、螢幕按鈕、自動低畫質，真機量過再決定完整版）。各項的難度與要先決定的事見 `docs/multiplayer/online-plan.md` §9。
- **平台設定總覽**：`docs/PLATFORMS.md`（Cloudflare DNS、Vercel、Render、Supabase、Resend 的設定值與存放位置；機密只註明位置、不寫值）。2026-10-17 新增，網域改為 `mistwood.yisoapp.com` / `mistwood-server.yisoapp.com`；Resend 寄信（方案 A）與 Render 自訂網域的驗證尚未完成。
- **上線整體規劃**：`docs/multiplayer/online-plan.md`（Vercel、Render、Supabase 的分工、架構圖、連線 / 斷線續玩 / 部署 / 雲端存檔流程圖、環境變數、各階段要使用者提供的帳號）。Phase 4、5 開始前要先拿到使用者的 Vercel、Render 帳號與 Supabase 專案，見該文件 §8 與「待使用者處理」。

**交接（2026-10-15，9F）**：任務 9F 風語草原的地圖與場景完成，`wip/9f-whispermeadow` 已 rebase 到多人連線之後並合回 `develop`（見「已完成」）。下一步可以接 9G（霏與風車聚落的居民、`quest_meadow_001`「風把話吹散了」），或回到多人連線 Phase 3，依使用者指示。

**環境注意**：這台機器的 `pnpm` 預設會用到 Node 12（`~/Library/pnpm/node`），執行前先 `export PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH`。若 `pnpm test` 出現 rolldown「Cannot find native binding」，執行 `pnpm install --force`。

**背景執行**：`pnpm e2e` 與 `scripts/screenshot.mjs` 的遊戲視窗預設在背景（不搶焦點、排在所有視窗後面，T-85）；需要前景（實測滑鼠鎖定）時加 `MISTWOOD_FOREGROUND=1`。`scripts/perf.mjs` 仍在前景。

## 在另一台電腦續作
1. `git clone https://github.com/YisoTsao/misty-forest.git && cd misty-forest`
2. 需要 Node 24、pnpm 12（`corepack enable` 或 `npm i -g pnpm`）。`pnpm install`（會下載 Electron 執行檔；`pnpm-workspace.yaml` 已允許 electron / esbuild 的 install script）。
3. 確認環境：`pnpm check`，再 `pnpm build`。e2e 只跑改動範圍的 suite（對照表見 `.claude/skills/mistwood-verify`）；要跑完整 `pnpm e2e` 會依序開 44 個 suite 的 Electron 視窗（約 50 分鐘），執行時不要操作電腦。
4. 試玩：`pnpm dev:electron`。
5. 未納入版本控制、需要時重新產生：`node_modules/`、`dist/`、`dist-electron/`、`release/`（`pnpm build`、`pnpm run pack`）。
6. AI 續作需要的文件：`CLAUDE.md`、`GAME_DESIGN.md`（規格 v3，優先依此）、`Mistwood_World_Bible_v2.md`（世界觀與內容）、本檔、`DECISIONS.md`。原始需求 `mistwood_game_spec.md` 與 skill `r3f-game-dev-spec` 不在 repo 內；最終規格書已涵蓋其內容。
7. Windows 機器：腳本皆為 Node，應可直接執行；`window-all-closed` 已會結束程式。效能數字請以 `node scripts/perf.mjs` 另外記錄到 `PERF.md`（可順便作為 B 級機器量測）。

## 已完成
### 任務 11M-8：手機版點聊天後觸控按鈕消失（2026-10-23）
- 現象（使用者 iPhone 截圖）：直式手機點 💬 打開聊天後，觸控搖桿與按鈕整組消失，畫面換成鍵盤版的提示（滑鼠左鍵、Q、F、C）。
- 原因：`InputManager.onMouseDown` 收到「觸控後補送的相容滑鼠事件」時會把輸入裝置切回 keyboard。iOS Safari 沒有 `sourceCapabilities`，原本的排除條件無效。
- 修正：監聽 `touchstart` 記下時間，800 ms 內的 mousedown 直接忽略（不切換裝置、不攻擊、不鎖定滑鼠）。
- 驗證：`pnpm check` 通過；e2e `touch`、`multiplayer-web`（含手機版點聊天鈕）通過。**未在真機 iOS 上重現或驗證**（Chromium 不會補送相容滑鼠事件，本機無法重現），需使用者在 iPhone 上確認。
- 同時看到：截圖中的「重新連線中」是 Render 免費方案伺服器休眠後的自動重連，屬預期行為。

### 任務 11M-7：部署修正、iOS 指標鎖定錯誤、同一帳號只能一處連線（2026-10-22）
- Render 部署失敗：`buildCommand` 的 `npm install -g pnpm@12.11.2` 寫入 `/usr/lib/node_modules`（Render 映像唯讀，`EROFS`）。改為 `npx --yes pnpm@12.11.2 ...`，啟動改為 `node --enable-source-maps dist-server/server.mjs`（不需要 pnpm）。在乾淨的 `git archive` 副本實際跑過 install、build:server，並以 `node` 啟動、`/health` 200。Render 與 Vercel 各自由 GitHub 的 `main` 推送觸發，Vercel 不會觸發 Render；之前同一指令在 `278e2b1` 成功過，`8722f15` 失敗，原因不明，新指令不依賴全域安裝。`vercel.json` 的全域安裝沒有改（Vercel 的建置環境可以寫入）。
- 手機上的錯誤 `this.target.requestPointerLock is not a function`：iOS Safari 沒有 Pointer Lock API。`InputManager.requestPointerLock` 先做功能偵測、再包 try，不支援就不鎖定（手機版本來就用觸控）。e2e `assets-web` 新增「模擬沒有 Pointer Lock API，點畫面不丟錯」；暫時還原修正後確認該項會失敗。
- 同一 Google 帳號只能一處連線（T-192）：客戶端加入時帶上 access token（`joinOptions.account`）；伺服器 `onAuth` 經 Supabase `/auth/v1/user` 確認帳號（`server/accounts.ts`），token 無效就拒絕加入。同一帳號後進的登入會把先進的踢下線（關閉碼 4000、原因 `account-elsewhere`，不保留座位）；斷線期間被登入的那一個重連回來時也會被踢。客戶端收到原因就不自動重新加入，顯示「這個帳號在其他裝置登入了」。訪客不受影響。
  - 需要在 Render 後台填 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`（`render.yaml` 已列為 sync: false）；沒填就不驗證，不會踢人。
  - 驗證：`server/WorldRoom.test.ts` 新增 4 項（同帳號互踢、訪客與不同帳號互不影響、無效 token 拒絕、斷線後重連被踢）、`server/accounts.test.ts` 3 項。`pnpm lint` 通過（修正 e2e 的全域變數宣告）。e2e `multiplayer-web`、`multiplayer`、`movement`、`dev`、`touch` 全過。
  - 未測：真的 Google 帳號在兩台裝置登入（需要手動測，見 `docs/multiplayer/accounts.md`）。
- 完整 `pnpm e2e`：第一輪 300 項全過，`garden`「回報桃樂；時間過去後花圃開花」失敗（0 !== 2，見「已知問題」），之後單獨跑 4 次全過，其餘 11 個 suite（`footprints` 至 `dev`）全過。`pnpm check` 1004 項通過。

### 任務 11M-6：載入畫面、網頁離開鈕、手機版聊天（2026-10-22）
- 載入畫面：快取命中時不顯示各種類列表與「第一次進入」說明。原本列表會先以「等待中」出現、再變成「已快取」（閃一下），現在開始顯示前就先檢查快取（`readCached`）。e2e 以 MutationObserver 確認重新整理時列表從未出現。
- 主選單的「離開遊戲」只在桌面版（Electron）顯示；網頁上 `window.close()` 對一般分頁無效，原本的按鈕沒有作用。
- 手機版聊天鈕：原本送出 Enter，離線時聊天列不存在，所以按了沒有反應。現在直接打開聊天列（`openChatFromButton`），且只在連線後顯示（離線沒有聊天功能）。
- 驗證：`pnpm typecheck` 通過；e2e `multiplayer-web`（手機版連線後點聊天鈕、離線時沒有聊天鈕）、`assets-web`（含快取命中時列表從未出現）、`touch`、`dev`、`account`、`multiplayer`（Electron）全過。截圖 `docs/screenshots/mobile/chat_touch.png`、`docs/screenshots/loading/reload_cached.png`。
- 完整 `pnpm e2e`（48 個 suite）exit 0，393 項全過、0 項失敗；`pnpm check` 997 項通過。

### 任務 11M-5：載入加速——模型壓縮、包 gzip、模型同時解析、開發伺服器快取（2026-10-21）
- 使用者回報：載入還是太久、重新整理沒有快取（每次重新讀一堆檔案）、載完按「開始遊玩」後停在「正在準備場景 99%」。
- 重現：開發伺服器上，場景載入中按開始會停在 99% 約 38 秒；原因是 React 19 的 Suspense 讓各處的 `useGLTF` 一個接一個載入（約 150 個模型）。開發伺服器沒有包，所以也沒有快取。
- 修正（T-191）：包處理完時所有模型一次 `useGLTF.preload`；角色與怪物模型用 `scripts/optimize-models.ts` 做 meshopt 壓縮（頂點位置不量化）；包 gzip、遊戲端 `DecompressionStream` 解壓；`vite dev` 也提供包（可快取）；載入畫面的場景準備顯示已載入的模型與材質數，最後一步顯示「正在建立世界、編譯材質…」。
- 結果：下載量 23.1 MB → 3.8 MB；建置版到可以玩 11 秒 → 3.5 秒、重新整理 3.2 秒（只剩清單一個請求）；開發伺服器 40 秒 → 6.5 秒，重新整理全部從快取讀出。
- 驗證：e2e `assets-web`（限速改 8 Mbps、新增下載量 < 6 MB 與「場景準備顯示模型數」的檢查，截圖 `docs/screenshots/loading/first_load_preparing.png`）、`melee`、`monsters`、`movement`、`dev` 全過；截圖 `--melee`、`--monsters`（`docs/screenshots/phase11/`）確認壓縮後的角色、武器拖尾與怪物外觀正常。`pnpm check`（Vitest 997 項）、`pnpm build` 通過；完整 `pnpm e2e`（48 個 suite）exit 0，393 項全過、0 項失敗。
- 新增 devDependencies：`@gltf-transform/core`、`@gltf-transform/extensions`、`@gltf-transform/functions`、`meshoptimizer`（只有壓縮腳本用，不進遊戲）。

### 任務 11M-4：技能與按鈕圖示、移除 LINE 登入、資源依種類打包與快取（2026-10-21）
- 技能圖示接上遊戲（T-189）：12 個法術依效果對應到 11M-3 的設計稿圖樣（`src/ui/spellIcons.ts`），外框依職業上色（`SkillIcon` 新增 `tone`）。武器、重擊、互動、跳、換武器、喝藥與六個選單鈕從 emoji 改成 SVG（`src/ui/ActionIcon.tsx`）。換到鍵盤 HUD、觸控按鈕、職業選擇。
- 移除 LINE 登入（T-188）：線上頁只剩「使用 Google 登入」。Supabase 後台的 `custom:line` 提供者還開著，要不要關由使用者決定（見「待使用者處理」）。
- 資源依種類打包與快取（T-190）：建置時把 271 個零散的模型與音效接成 5 個包（角色 17.2 MB、怪物 2.2 MB、建築與道具 2.3 MB、花草樹木 0.9 MB、音效 0.4 MB），載入畫面列出各種類的大小、進度、是否已快取，以及整體的已下載量與預估剩餘時間；下載完存進 Cache Storage，重新整理時網路上只剩 22 KB 的清單一個請求。桌面版（file://）不快取，但同樣只讀 5 個包。`vercel.json` 為包加上一年 immutable。
- 新增 e2e `e2e/assets-web.e2e.mjs`（Web 版，vite preview + Playwright Chromium，不在 `e2e:all` 內，`pnpm e2e:assets-web`）：限速 40 Mbps 第一次進入（5 個包的請求、沒有 `/models`、`/audio` 的零散請求、畫面上有五個種類與剩餘時間）、重新整理（每個種類都從快取讀出、網路位元組 0）、鍵盤 HUD 與觸控介面的圖示是 SVG、觸控按鈕沒有 emoji。截圖 `docs/screenshots/loading/first_load_downloading.png`、`reload_cached.png`、`hud_icons.png`、`touch_icons.png`。
- 驗證：`pnpm check`（Vitest 996 項；`server/WorldRoom.test.ts`「兩個人看得到彼此」並行時逾時一次，為已知問題，改動前的程式也會失敗，單獨重跑 3 次全過）、`pnpm build` 通過。`assets-web` 4 項全過。完整 `pnpm e2e`（48 個 suite）：`audio`「晴朗時有鳥叫」失敗——共享世界時鐘當時是夜晚（鳥叫乘上 `1 - night`），比照 fbf4ef3 在測試裡固定中午後通過；`garden`「時間過去後花圃開花」連跑時失敗一次（1 !== 2），單獨重跑通過；其餘全過。桌面版確認 5 個包、271 個檔案都由包讀出。
- 未做：第一次的下載量沒有變小（角色 GLB 重複的骨架與動畫、meshopt 壓縮），見 DECISIONS T-190。

### 任務 11M-3：手機版回報六項修改＋角色技能圖示（2026-10-21）
- 載入條：`LoadingScreen` 的進度取目前為止的最大值（drei 每批資源會從頭算，舊版會一直倒退重跑），場景就緒前最多顯示 99%，只留一條進度條。
- 手機版不顯示「Esc 關閉」：`keyVars` 新增 `{esc}` / `{close}`（手機版為空字串），地圖、日誌、建造選單與商店、工作台的提示改用這兩個變數；鍵盤版文字不變。
- 法術特效不被草叢遮住：魔法圓、衝擊波與粒子材質 `depthTest: false`，粒子與魔法圓 `renderOrder` 提高到 10。副作用：所有粒子特效（含命中火花）不再被牆或地形遮住，之後若要限制到法術再拆。
- 手機版背包：格子裡圖示縮小，數量移到底部獨立一條（白底小標），不再重疊。
- 手機版任務日誌：清單改到上方（橫向捲動的分頁、清單高度上限 34%），詳細內容在下方；標題列加關閉鈕（`journal-close`），不顯示鍵盤提示。
- 點小地圖打開世界地圖（`Minimap` 改為可點、`setWorldMapOpen(true)`；暫停中不開）。
- 角色技能圖示 32 個（`src/ui/SkillIcon.tsx`，SVG 手繪，依職業分藍 / 金 / 紫 / 紅四色外框）。**尚未接到遊戲**：設計稿的技能名稱（星光治癒、聖光斬、火焰術、旋風斬…）與目前 `src/data/spells.json` 的 12 個法術（星光衝擊、星屑飛彈…）不同，待使用者決定要改哪一邊再對應。
- 驗證：`pnpm check`（Vitest 989 項）、`pnpm build` 通過；e2e `touch`、`journal`、`map`、`magic`、`shop`、`craft`、`dev` 全過（exit 0）。截圖 `docs/screenshots/mobile/journal_portrait.png`、`inventory_portrait.png`、`minimap_tap_map.png`（背包截圖沒有物品，數量重疊的修正未在畫面上看到）。
- 未做：載入時間過長的根本處理（模型壓縮、角色 GLB 共用骨架與動畫）；見下一步。

### 任務 11M-2：手機版修正（2026-10-21，使用者回報四張截圖）
- 連點兩下畫面會放大：所有元素 `touch-action: manipulation`，另以 `mobileGuards.ts` 攔下同一位置的雙擊（`touchend`）、`dblclick` 與 iOS 的 `gesture*` 雙指縮放整頁（按鈕與輸入框不攔，連點「繼續」不會少一下）。
- 重新整理先看到空白天空與 HUD：新增 `LoadingScreen`（場景就緒前蓋住畫面、顯示下載進度，不攔點擊、就緒立刻卸載）。原因是下載量大（模型約 23 MB，其中 5 個角色 GLB 各約 3.6 MB；JS 5.9 MB）且 `/models` 沒有快取設定，每次重新整理都要重新驗證 232 個檔案：`vercel.json` 為 `/models`、`/audio` 加上一天快取＋一週 stale-while-revalidate。
- 世界地圖：觸控介面改成全螢幕（畫布佔滿畫面、標題 / 探索度 / 可收合圖例浮在左上、縮放鈕與關閉在右上、雙指縮放），地名與地標縮小（`MapView.textScale`）。
- 背包：觸控時格子、說明圖示與文字縮小，不顯示鍵盤提示。
- 整體字級：觸控介面 `html.touch-ui { font-size: 13px }`（Tailwind 的 rem 字級與間距一起縮小）；跟小地圖（固定像素）對齊的選單鈕、教學位置改用 px，任務追蹤下移；橫向矮畫面（高 ≤ 420 px）收起小地圖下的地名，避免壓到右下按鈕。
- 提示框點擊關閉：芽芽的泡泡、教學提示（收起目前這一步）、訊息視窗（點外面）。對話框原本就是點一下下一句。
- 全螢幕：觸控裝置按「繼續遊戲 / 新遊戲 / 進入線上世界」時 `requestFullscreen`。**iPhone 的瀏覽器（Safari、Chrome 都是 WebKit）不支援網頁全螢幕**，改為加 `manifest.webmanifest`（`display: fullscreen`）與 apple-mobile-web-app meta：用「分享 → 加入主畫面」開啟就沒有網址列。Android 與 iPad 可直接全螢幕。
- 測試：`pnpm check`（Vitest 989 項）、`pnpm build` 通過。e2e `touch`（新增「全螢幕地圖」「點教學提示收起」共 13 項）、`dev`、`map`、`companion`、`tutorial`、`world`、`movement`、`journal` 全過；第一輪 `touch` 直向時血條與任務追蹤重疊（字級縮小後偏移量不一致）→ 修正。改到 `public/` 與 `vercel.json`，push 前要跑完整 `pnpm e2e`（尚未執行）。截圖 `docs/screenshots/mobile/landscape_map.png` 等。
- 未在實機驗證：雙擊縮放的攔截、iPhone「加入主畫面」的全螢幕、Vercel 快取標頭（部署後才生效）。

### 任務 11M：手機版觸控操作（2026-10-21）
- 使用者要求：手機也能玩、用虛擬搖桿、支援橫向與直向。觸控裝置（`(pointer: coarse)`）自動切換觸控介面，`?touch=1` / `?touch=0` 可強制開關；用鍵盤或手把時切回原本的介面。
- 操作：左半邊浮動搖桿（推到外圈跑步）、右半邊拖曳轉視角、雙指縮放；右下以攻擊鈕為圓心的兩圈弧形按鈕（攻擊、重擊、互動、跳、三個法術、換武器、喝藥，含冷卻遮罩，依螢幕大小縮放）；選單鈕（暫停、背包、地圖、任務、芽芽、聊天：直向排一欄在小地圖下、橫向排一列在小地圖左邊）；點互動提示也能互動。按鈕按下就觸發，並吞掉隨後補送的 click（否則會落在新出現的暫停選單背景上，暫停一閃即逝）。純函式在 `game-core/input/touch.ts`。
- 排版：血條移到左上、任務追蹤在它下面、教學與頭目血條依方向調整、通知與聊天移到畫面中段、小地圖縮小、觸控時不顯示鍵盤提示與除錯面板；所有視窗加 `ui-panel`（不超出畫面、可捲動）；背包在窄螢幕改成上下排；主選單與職業選擇在小螢幕縮小、可捲動；viewport 禁止整頁縮放、`100dvh`、關閉點擊反白與下拉回彈。觸控裝置預設低畫質。按鍵名稱在觸控時顯示按鈕圖示，教學的「移動」一步有觸控版說明。
- 限制：手機版還不支援建造模式；聊天輸入依賴手機鍵盤，未在實機測過。
- 順帶修正的 e2e：`world`、`region`、`cellar` 的白天 / 畫面飽和度檢查改為先 `setClock(12)`（共享世界時鐘在夜裡會失準）；`melee` 的存檔斷言補上 v17 的 `heroClass`。
- 測試：`pnpm check`（Vitest 989 項，新增 `touch.test.ts`）、`pnpm build` 通過。新增 `e2e/touch.e2e.mjs` 11 項（橫向 844×390 與直向 390×844 的 HUD 不超出、不重疊；搖桿走路與跑步；拖曳視角；雙指縮放；跳躍與攻擊鈕；點提示開寶箱；背包與暫停；主選單 → 選職業 → 開始）。完整 e2e（48 個 suite）：第一輪在 `world` 因時間問題中斷 → 修正；第二輪到 `melee` 失敗 1 項 → 修正；其餘 28 個逐一跑，`cellar` 失敗 1 項 → 修正；三項修正後重跑全過。截圖 `docs/screenshots/mobile/`。
### 任務 13B：倒流溪谷水輪（第二章 Phase 2，規格 P-02）
- 通用謎題（`src/game-core/world/puzzles.ts`、`src/data/puzzles.json`）：一組轉動機關全部轉到答案時，啟動開的物件（`ObjectActivated`，source `puzzle`），只在剛完成的那一刻啟動。答案由石碑（`creek_tablet`）讀出：1、3、2 格。
- 三座水輪（`waterwheel`，`turn` 4 個位置，轉軸沿模型 X 軸，`TurnableGroup` 渲染）；石障 `creek_barrier` 擋住溪谷往上游的路，啟動後移除碰撞與模型。
- 規格的「可推動石塊」與「壓力板」沒有做（需要推動與物理互動的新機制），留到之後。
- 測試：`pnpm check`（Vitest 979 項，新增 `waterwheel.test.ts` 5 項）、`pnpm build`。e2e `creek`（讀石碑、轉錯不開、依答案開、存讀檔）全過；`glowmoss`、`forestquest` 重跑全過。截圖 `docs/screenshots/phase13/glowmoss_creek.png`：水輪外形偏簡，溪水在這個角度看不到，美術待改。
- `pnpm check` 一次出現 1 項失敗、重跑全過（與 PROGRESS 已知的 WorldRoom 偶發逾時同類），未追查。

### 任務 13C：聚落主線 quest_forest_002–004（第二章 Phase 2，規格 8.2 CH2-MQ-02 至 04）
- 菇菇婆婆（`granny`，D 區，placeholder 模型）是聚落的主要 NPC：開啟聚落工作台（13A）、交付主線。
- `quest_forest_002` 螢苔的呼吸：交出螢苔凝膠 ×2 → 純淨螢苔 ×2。`quest_forest_003` 倒流的溪水：新目標類型 `puzzle`（機關全部轉到位，進度以目前的轉動位置判斷；任務自動達成，回報時拿星晶碎片 ×2）。`quest_forest_004` 不願相信旅人的居民：交出微光孢子 ×2 → 螢光提燈（新道具）。
- 規格 CH2-MQ-04 寫的是「協助聚落並取得信任」，目前只做了上面的交付，還沒有其他村民與信任度。
- 測試：`pnpm check`（Vitest 979 項）、`pnpm build`。e2e `granny` 新增（接取、交付、水輪、交付、提燈）全過；`quest`、`npc`、`journal`、`forestquest`、`creek`、`equipment` 重跑未見失敗。
- 教訓：改了資料之後沒重新 build，e2e 會跑舊的建置；之後每次改資料都先 `pnpm build`。

### 任務 13D：翻滾閃避（第二章 Phase 3，規格 10.1）
- 動作 `dodge`（鍵盤 Z，手把沒有按鈕可用，測試中豁免並記在下方）。權威指令 `Roll`：無敵 0.45 秒（`rollUntil`），冷卻 1.1 秒（`rollReadyAt`），倒下時不能翻滾；翻滾中敵人的攻擊不扣血（`EnemyStrike` 回傳空事件）。不存檔。
- 動作：`stepLocomotion` 的 `roll`（沿移動方向、沒有方向就沿面向，8 m/s，翻滾中不接受移動與跳躍）；只有權威層接受時才開始滾。
- 測試：`roll.test.ts` 6 項（冷卻、倒下、方向與恢復）；e2e `roll` 3 項（翻滾、冷卻中無效、翻滾中不扣血／結束後照常扣血）。`pnpm check` 982 項通過；e2e `movement`、`bounds`、`combat`、`melee`（存檔的 loadout 欄位）、`settings`、`gamepad`、`dev` 全過。
- 未做：翻滾的專屬動畫（目前沿用走路／跑步）、手把翻滾鍵。

### 任務 13E：迷霧深層的怪物與濃霧傷害（第二章 Phase 3，規格 §6.2 M-03、M-04、M-05）
- 霧紋森林狼（`mob_mist_wolf`）：盤旋（orbit）後衝撞（lunge），掉落霧紋獸牙、厚實獸皮（稀有）。幻霧螢靈（`mob_fog_wisp`）：遠距離攻擊（spit）後瞬移（retreat）。枯根守衛（`mob_root_guard`，精英）：縮殼擋傷（shell）、掉落守衛木核。生成點都在 `deep_mist`（深層）。
- 濃霧傷害（`MistHarm` 指令）：只對 `regions.json` 標記 `mistHarm` 的區域（迷霧深層）生效，每 2 秒扣 2 點，守林者護腕的迷霧倍率減半。客戶端在 `RegionTracker` 計時送出。
- 規格的差異（未做）：枯根守衛的兩階段（目前只有縮殼）；幻霧螢靈的致盲與提燈現形（要等星光照明與螢光提燈）；森林狼的硬直與叫同伴；迷霧深層的週期濃霧。模型是暫用的 GreenSpikyBlob（狼）、Ghost（螢靈）、Goleling（守衛）。
- 測試：`deepWoods.test.ts` 4 項、`equipment.test.ts` 迷霧傷害 2 項；e2e 新增 `deepwoods`（生成、深層扣血、A 區不扣血、狼被打倒）全過。`monsters` 的涵蓋範圍改為排除只由分裂產生的小怪（`mob_moss_slime_small`）；`region` 的飽和度項目這次通過（已知的共享時鐘時刻問題）。
- `pnpm check` 991 項通過。

### 任務 13F：星晶祕窟與 P-03 光路機關（第二章 Phase 4，規格 P-03、§9.3）
- 祕窟在環狀山脊的東南開口，平時被星光石門（`crystal_gate`，沒有互動，只由光照啟動）擋住。祕窟內三面星晶鏡（`crystal_mirror`，4 個方向，沒有任務限制）、寶箱（`chest_crystal`：星晶碎片、古代共鳴石片）、石碑（答案：鏡 1 轉 2 次、鏡 2 轉 1 次、鏡 3 轉 1 次）。
- 光路 `crystal_light` 沿用 9D 的水鏡光路（`lightPaths.json`）。`MirrorPuzzle` 改為畫出所有光路；`lightPathRuntime` 依光路 id 分開記錄（否則兩條路的光束數會互相覆蓋，lightpuzzle 的 debug 讀數就錯了）。
- 測試：`crystalCave.test.ts` 4 項（答案照到石門、只在完成時啟動、不重複啟動、位置）；e2e `crystal`（石碑、轉鏡、石門開、寶箱拿共鳴石片）全過；`lightpuzzle`、`mirrorlake`、`glowmoss`、`creek` 重跑全過。
- 修正過程：寶箱與石碑一開始放在地形隆起處，玩家站上去、互動距離不夠；改到地面平的地方（高度 0.4）。
- 未做：星晶祕窟的「地下湖、晶柱」場景與隱藏入口的提示（只有石門與光路，沒有線索指向它）；星晶鏡的模型用 9D 的石柱造型，外觀待看。石門的 `gate` 區域是 glow_garden（生成時的區域判定，不影響功能）。

### 任務 13G：古樹祭壇與根噬者（第二章 Phase 4，規格 B-01、G 區、CH2-MQ-05 至 08）
- 根噬者（`boss_root_devourer`，placeholder 模型：MushroomKing 的骨架）：戰場在古樹祭壇（半徑 10，中心是古樹）。招式：根刺（spikes）、手臂揮擊（slam）、衝撞（charge）、霧球（orbs）；血量低於 60% 進入第二階段（冷卻縮短）。
- 淨化（新機制 `purify`）：血量歸零時不會死，停在 1 點、進入「淨化」（`EnemyPurifying` 事件，頭目停下不出招）。祭壇三座古樹共鳴石柱（`altar_resonance`，沿用星光燈柱造型，activate 時帶 `boss`，只能在戰鬥中啟動）全部點亮 → 打倒（`EnemyDefeated` + `BossDefeated`，只結算一次）。
- 任務：`quest_forest_005` 被遺忘的守護者（擊敗枯根守衛）、`006` 星晶的記憶（星光石門開）、`007` 古樹最後的呼吸（淨化根噬者，菇菇婆婆回報）、`008` 湖面上的倒影（走到澄鏡湖入口，無發起人自動完成）。菇菇婆婆的對話依任務狀態接續。
- 澄鏡湖入口改為 `quest_forest_008` 完成後才開（T-186）：`maps.test.ts` 與 mirrorlake e2e 同步更新。過渡期間的 T-187 規則取代。
- 測試：e2e `altar`（接任務、進戰場、淨化不死、三座石柱、回報）全過；`puffking`、`liyi`、`combat`、`lightpuzzle`、`granny`、`forestquest`、`crystal`、`creek`、`mirrorlake` 全過；`pnpm check` 1001 項。
- 未做：第二階段的三座共鳴石柱「安全區」與召喚幻霧螢靈（目前只有霧球）；章節結尾的過場與對話（只有戰後的提示與菇菇婆婆的回報）；第三章「澄鏡湖」的正式入口文字（目前沿用既有的湖區）；根噬者的專屬模型與美術。

### 任務 13H：星光照明、污染根瘤、隱藏的寶箱（第二章 Phase 3，規格 10.2、§5.2）
- 星光照明（動作 `lumen`，鍵盤 G；手把沒有按鈕，測試中豁免）：花 15 點星光值，12 秒內揭露隱藏的寶箱（`contents.requiresLumen`）。權威指令 `Lumen`；星光不夠時拒絕並提示。不存檔。
- 污染根瘤（`corruption_root`，兩個在迷霧深層）：用一顆純淨螢苔淨化，根瘤消失並顯示訊息。
- 隱藏的寶箱（`hidden_cache_01`，花園石頭後面）：沒有照明打不開，照明中打得開。
- 規格的差異：照明還不會「揭露」畫面上的線索（隱藏寶箱一直看得見，只是打不開），幻霧螢靈的現形也還沒做；污染根瘤沒有戰鬥淨化的路徑。
- 測試：`starLumen.test.ts` 4 項；e2e `lumen`（沒照明打不開、按 G、照明中打開）全過；`combat`、`melee`、`dev`、`settings`、`gamepad`、`save` 重跑全過。`pnpm check` 1007 項通過。

### 任務 13I：蘑菇居民聚落的建築與公告板（第二章 Phase 2，規格 4.2 D）
- D 區加入三間小屋（KayKit 小屋造型）與公告板（沿用 `notice_board`）；菇菇婆婆（13A、13C）在聚落中央。
- 未做（規格 Phase 2 仍有的項目）：支線任務 CH2-SQ-01 至 06、壓力板與可推動石塊（P-02 的另外兩種機關）、村民的正式模型與信任機制、以及聚落主入口的開啟（目前溪谷石障是唯一的入口）。

### 任務 13O：支線 CH2-SQ-02「螢火蟲回家」（第二章 Phase 2，規格 8.3、NPC-02）
- 莉露在 `quest_forest_001` 之後提出（`quest_forest_sq02`）：找回三隻失散的螢靈（`lost_firefly_01`–`03`，A 入口、B 花園、C 溪谷；新程式造型 `procedural:lost_firefly`——發光小蘑菇下的一團光），任務進行中才能「輕聲呼喚」，叫回來後物件消失。回報拿微光孢子 ×3、純淨螢苔 ×2、種籽幣 ×20。規格的「燈籠外觀」沒有外觀系統，暫不做。
- 莉露的對話順序：001 → 螢火蟲支線（提出 / 進行中 / 回報）→ `lilu_after`。
- 重新產生 placement：新增三隻螢靈，另有一叢裝飾灌木（`glowmoss_bush_100`）被擠開位置。
- 測試：`pnpm check`（Vitest 1043 項）、`pnpm build`；e2e `forestquest` 新增支線 1 項共 8 項全過。截圖 `docs/screenshots/phase13/glowmoss_firefly.png`（書籤 `glowmoss_firefly`，已檢視）。

### 任務 13N：章節結尾——古樹核心的記憶與無名旅人（第二章 Phase 4，規格 CH2-MQ-07、08、§2.4、NPC-04）
- **修正缺口**：`quest_forest_008` 沒有發起人，原本沒有任何地方會接取它，正常遊玩永遠打不開往澄鏡湖的出口。現在菇菇婆婆的 007 回報對話同時接下 008。
- `quest_forest_007` 的獎勵：古樹核心（`ancient_core`，任務道具）。`quest_forest_008` 改為兩個目標：在祭壇觀看古樹核心的記憶（`ancient_memory_01`，沿用倒影的程式造型，`activate.message` 顯示看到的湖與星形符號）→ 走到澄鏡湖的入口；兩者完成後自動完成，出口打開。
- 無名旅人（`wanderer`，KayKit Rogue_Hooded）：007 完成後出現在澄鏡湖出口旁，說出規格 §2.4 的台詞（「去看看湖中那個不屬於你的倒影」），不揭露身分。
- 存檔不改版；008 的目標順序改變，舊存檔若 008 進行中，進度索引會錯開（目前沒有玩家走到這裡，只在開發中）。
- 未做：真正的過場動畫（目前是訊息視窗）、無名旅人的專屬模型。
- 測試：`chapterEnding.test.ts` 2 項；`pnpm check`（Vitest 1041 項；`WorldRoom` 偶發逾時一次，單獨重跑通過）、`pnpm build`；e2e `altar` 新增 2 項共 9 項全過；`mirrorlake`、`granny`、`journal` 全過。

### 任務 13M：根噬者的迷霧暴走與重試重置（第二章 Phase 4，規格 §6.4 B-01）
- 第二階段（血量跌破 60%）：頭目資料新增 `boss.summon`，根噬者召喚幻霧螢靈 ×2（id 為「頭目 id+序號」，在祭壇的生成點出現；只在跨過門檻的那一下召喚一次）。新增提示 `root.phase2`、`root.left`。
- 重試：新權威事件 `ObjectDeactivated`。頭目戰結束（離開戰場 `EndBossFight`、玩家倒下）時，頭目與召喚物消失、已點亮的淨化共鳴石柱熄滅，下次重新開戰是滿血、石柱要重新點亮。淨化完成時召喚物跟著散去。霧團噗啾王與璃漪的規則不變（沒有召喚與淨化石柱）。
- 第三階段（星光淨化）沿用 13G：血量歸零停在 1 點、停止出招，三座石柱全亮後打倒。
- 未做：紫色迷霧區域、石柱的「安全區」效果、根噬者的專屬模型。
- 測試：`rootDevourer.test.ts` 4 項；`pnpm check`（Vitest 1039 項）、`pnpm build`；e2e `altar` 新增 2 項（召喚螢靈、離開戰場重置）共 7 項全過；`puffking`、`liyi` 全過。

### 任務 13L：支線 CH2-SQ-03「商人的失物」（第二章 Phase 2，規格 8.3）
- 托托提出（`quest_forest_sq03`，前置 `quest_forest_004`）：撿回迷霧深層的貨箱（`toto_crate_01`，KayKit 木箱，只有任務進行中能撿，撿起後消失）＋擊退霧紋森林狼 ×3 → 回報拿 40 枚種籽幣與厚實獸皮；貨攤解鎖守衛木核（24）與星晶碎片（18）。托托的對話依任務狀態切換（提出 / 進行中 / 回報 / 平常），每段都能開貨攤。
- 貨箱寫在 `gen-glowmoss.ts`，重新產生 placement 只多出這一個物件。
- 測試：`pnpm check`（Vitest 1035 項）、`pnpm build`；e2e `toto` 擴充為 5 項（接取、撿貨箱、打三隻狼、回報、貨攤解鎖）全過；`quest`、`journal`、`glowmoss` 全過。

### 任務 13K：旅行商人托托與貨攤（第二章 Phase 2，規格 NPC-03、CH2-MQ-04 的「商店」）
- 托托（`toto`，KayKit Barbarian 拿酒杯、隱藏武器與盾）在聚落東側（2040, 18）；`quest_forest_004`（取得聚落信任）完成後才出現（`visible`）。對話：看貨、打聽消息（星晶祕窟的石門只認星光、貨箱被森林狼弄丟，為 CH2-SQ-03 鋪陳）。
- 貨攤 `shop_toto_wares`：賣草藥水、月露軟膏、柔韌樹皮、厚實獸皮、古樹樹脂；收星晶碎片（8 枚種籽幣，比其他商品高）、菌帽、獸牙、守衛木核等。
- 測試：`pnpm check`（Vitest 1034 項）、`pnpm build`；e2e 新增 `toto`（信任前不在、出現後開貨攤、賣星晶、買藥水，3 項，已加進 `e2e:all` 與 `e2e:chapter2`）全過；`npc`、`shop` 未見失敗。截圖 `docs/screenshots/phase13/glowmoss_toto.png`（由 toto e2e 拍，已檢視）。

### 任務 13J：菌帽小妖（第二章 Phase 2，規格 §6.2 M-02）
- 菌帽小妖（`mob_cap_imp`，Mushnub 模型換色：奶油色身體、橘紅菌帽）：新行為 `skirmish`——出手後轉身跑開 1.3 秒再回頭追擊，跑開中被打不會回頭。掉落菌帽（新素材 `fungus_cap`）、柔韌樹皮。生成點：B 花園東側（`glowmoss_imps_garden`）、D 聚落北面入口內（`glowmoss_imps_village`），一次 2–3 隻。
- 未做：孢子煙霧攻擊、撿走地上的可拾取物。
- 測試：`capImp.test.ts` 4 項；`pnpm check`（Vitest 1034 項）、`pnpm build` 通過；e2e `deepwoods`（新增花園生成菌帽小妖）、`monsters`、`combat` 全過。截圖 `docs/screenshots/phase13/monster_mob_cap_imp.png`（已檢視）。

### 任務 13A：裝備系統（第二章 Phase 2，PHASE0 §4、規格 §7.3–7.4）
- 三個裝備格（武器變體、防具、飾品）；裝備中的道具不在背包裡（不能被賣、交給任務或製作）。`items.json` 新增 `equipment` 類別、`equip`（格、基礎武器、效果）與 `passive`（持有即生效）；掉落表的 `rare` 項目受稀有加成影響。純函式 `equipmentModifiers` 合併倍率（`src/game-core/equipment/equipment.ts`）。
- 規則：`EquipItem` / `UnequipItem`；武器變體受職業限制；換裝時原本的裝備放回背包（放不下就拒絕）。`enemyStrike` 套用防具減傷、`attackDamage` 套用武器倍率（只在基礎武器是目前的武器時）、`rollIntoInventory` 套用稀有加成。
- 三件裝備：螢晶短劍（短刀變體）、螢苔法杖（法杖變體）、守林者護腕（減傷 0.9、稀有 +15%、迷霧傷害 ×0.5，迷霧傷害要到 Phase 3 才有作用）。材料：霧紋獸牙、厚實獸皮、柔韌樹皮、守衛木核、星晶碎片、古樹樹脂（只有定義與配方，來源在後續任務加入）。
- 水行護符改成被動效果（`passive: waterBreath`），`Player.tsx` 的寫死檢查移除（行為不變）。
- 聚落工作台 `glow_workbench` 的配方由菇菇婆婆開啟（NPC 在 D 區，對話 `openCraft`）。
- 存檔 v20：`loadout.equipment`；v19 → v20 遷移為空裝備。
- UI：背包加裝備格與「裝備 / 卸下」按鈕。
- 測試：`pnpm check`（Vitest 970 項，新增 `equipment.test.ts` 10 項）、`pnpm build`。e2e 新增 `equipment`（裝備、卸下、武器變體職業限制，3 項）全過；`save`（存檔欄位）、`craft`、`lightpuzzle`、`lake`、`dev` 全過。減傷的實際扣血數值只有單元測試，沒有 e2e。

### 任務 12E：莉露與 quest_forest_001「失去光芒的森林」（2026-10-23，分支 `wip/ch2-glowmoss`，規格 CH2-MQ-01）
- 莉露（`lilu`，placeholder 模型：KayKit Rogue，之後換正式模型）在迷霧入口的燈柱旁。第一章完成（`quest_dawn_003`）後提出委託，接取 → 採集純淨螢苔 → 點亮 `glowmoss_star_lamp_01` → 回報，拿到星光羅盤（`star_compass`，只給道具，指引功能之後做）。之後莉露改說後續的話。
- 目標只有「點亮燈柱」。規格的「採集」由燈柱的素材需求承接（純淨螢苔被燈柱消耗，所以不能做成「持有數量」的收集目標）；莉露的「回報」是 `turnInQuest`，不另設 `talk` 目標（對話在任務就緒後才出現，不能當作目標）。
- 存檔不改版（任務紀錄與道具本來就在存檔裡）。
- 測試：`pnpm check`（Vitest 961 項，新增 `forestQuest.test.ts` 4 項）、`pnpm build` 通過。e2e 新增 `forestquest`（接取、採集、點亮、回報、存檔、讀檔，共 7 項）全過；`glowmoss`、`glowslime`、`npc`、`quest`、`journal` 重跑未見失敗。截圖 `docs/screenshots/phase12/glowmoss_lilu.png`（已檢視：莉露在燈柱旁，外形為暫用模型）。
- 未做（Phase 1 驗收前）：完整 `pnpm e2e`（收尾前跑）、`perf.mjs`（規格的階段驗收，需要使用者離開電腦時跑）、合回 `develop`（分支落後 `develop` 很多，且決策編號 T-188 撞號，見 DECISIONS）。

### 任務 12D：螢苔史萊姆（2026-10-23，分支 `wip/ch2-glowmoss`，規格 M-01）
- `mob_moss_slime`：GreenBlob 換色（薄荷綠）、跳撞（沿用 `lunge`）、黏液噴射（沿用 `spit`，距離 2.5–6 m、減速）、擊破後分裂成兩隻 `mob_moss_slime_small`（沿用 `splitInto`，小的不再分裂）。生成點 `glowmoss_slimes_a`（A）、`glowmoss_slimes_b`（B）。
- 掉落：螢苔凝膠（`moss_gel`，60%）、微光孢子（`glow_spore`，35%）；小史萊姆只掉凝膠 20%。新增兩個材料，圖示沿用既有的凝膠與花粉造型。
- 與規格的差異：規格寫「低血量時分裂」，現有的分裂機制是擊破時分裂（水泡精同），沿用之；「星光攻擊弱點」目前沒有屬性剋制系統，未做。
- 測試：`pnpm check`（Vitest 957 項，新增 `mossSlime.test.ts` 6 項）、`pnpm build` 通過。e2e 新增 `glowslime`（A、B 生成、分裂與小的不再分裂）全過。截圖 `docs/screenshots/phase12/monster_mob_moss_slime.png`（已檢視：外形可辨識，顏色偏灰白，霧重時尤其明顯，之後可調）。

### 任務 12C：星光燈柱與純淨螢苔（2026-10-23，分支 `wip/ch2-glowmoss`，規格 P-01、Bible §6.4）
- 第一座星光燈柱（`glowmoss_star_lamp_01`）放在 A 迷霧入口的拱門後方、小徑南側。未啟動的晶體暗淡；消耗一顆純淨螢苔點亮，所在區域（`mist_gate`）的迷霧從濃霧降到淡霧（`activate.mistDown`，純函式 `lowerMistStage`），顯示訊息。素材不足時的提示列出需要的材料（沿用 `missing-materials` 的吐司）。
- `pure_glowmoss`（純淨螢苔，材料，圖示 `ItemIcon`）；採集點 `glowmoss_node`（`glow_node_basic`：純淨螢苔 1，螢苔 50%；480 秒重生），兩個放在 A 區入口與小徑旁。
- 只放一座燈柱：Phase 1 的範圍是「一座星光燈柱」；規格的三座（A、B 各一座以上）與 B 區的燈柱留到之後。
- 存檔沒有改版（燈柱的 `active` 與迷霧本來就存在存檔裡，v19 不變）。gen-glowmoss 新增 3 個 placement，`pnpm data:placements` 重產 placements.json（只有祕林的散佈因共用的佔位而重排）。
- 測試：`pnpm check`（Vitest 949 項，新增 `starLamp.test.ts` 6 項、`mist.test.ts` 1 項）、`pnpm build` 通過。e2e：`glowmoss`（新增：沒有純淨螢苔時不點亮、採集、點亮後消耗與迷霧降一段與訊息、讀檔後保持點亮）全過；`mirrorlake`、`dev` 全過。截圖 `docs/screenshots/phase12/glowmoss_lamp.png`（燈柱未啟動的外觀，已檢視：石柱與晶座可辨識，晶體偏暗）。
- 未做：燈柱「可互動」的外觀（目前只用互動提示表示）；燈柱與採集點目前是程式造型（`star_lamp` 為新造型，採集點沿用螢苔叢造型），正式模型待定。
- 完整 `pnpm e2e` 尚未跑（收尾前再跑）。

### 任務 12B：螢苔祕林新地形、迷霧入口與螢苔花園（2026-10-20，分支 `wip/ch2-glowmoss`）
- 地形重寫（`glowmossTerrain.ts`）：七區 A–G 的版面（T-188，Bible §6.3 版面表）、新的小徑（入口 → 花園環狀步道 → 溪谷 → 聚落 → 深層 → 祭壇 → 澄鏡湖出口）、溪谷谷地、聚落 / 祭壇 / 祕窟的環狀山脊；移除舊的小渠、石環、苔冠空地、根鬚迷宮。
- 區域：`moss_trail` / `moss_glade` / `root_maze` / `moss_crown` 換成七個新區域（`types.ts`、`regions.json`、`regions.ts` 初始迷霧，預設區域 `glow_garden`）。
- 擺放（`gen-glowmoss.ts` 重寫）：A 迷霧入口的石拱門、破損的路牌（可閱讀）、第一個寶箱；B 螢苔花園的 8 朵巨型蘑菇、發光立石、樹根拱門、螢光花叢、螢苔與月露草採集點；C–G 一般森林散佈；拱門到花園留一條視線。新的程式造型：石拱門、破損路牌、螢光花叢（`forestModels.ts`）；移除月牙樹、迷宮樹根牆的 prefab。
- 往澄鏡湖的出口移到古樹祭壇東南（`gen-mirrorlake.ts`），名稱改為「林道出口：澄鏡湖」；其他地圖的 placement 完全沒變（已比對）。
- 螢光孢子集中在花園與聚落（入口的螢火蟲「失去光芒」）；地形材質與地圖圖片改用 `GLOWMOSS_WATER_LEVEL`；地標、相機書籤、翻譯、區域提示同步更新。
- 存檔 v19：舊的四個區域迷霧換成七個新區域的初始值；站在祕林裡的玩家移到入口、面向東。
- **順帶修正的 bug**：打開任何寶箱都會跳出序章寶箱的紙條（「迷路的旅人啊，循著小路往北走……」），改為只有放出星光夥伴的寶箱才顯示（`InteractionSystem.tsx`）。
- 測試：`pnpm check`（Vitest 940 項：`maps.test` 的祕林地形與區域改寫、新增 v18 → v19 遷移）、`pnpm build` 通過。e2e：`glowmoss`（改寫：迷霧入口、路牌、第一個寶箱且沒有紙條、穿過石拱門進花園、花園採集）、`mirrorlake`（新出口）、`save`、`map`、`bounds`、`world`、`companion` 全過；`region` 的「森林清除後畫面變鮮豔」失敗 1 項，**12A 的版本在同一時間也失敗**（見「已知問題」）。
- 截圖 `docs/screenshots/phase12/glowmoss_{entry,arch,chest,garden,garden_center,lake_exit,overview}.png`（拍攝時共享時鐘在傍晚 18:27；拱門與花園修正後重拍了 entry、arch、garden）。

### 任務 12A：移除舊版螢苔祕林、存檔 v18（2026-10-20，分支 `wip/ch2-glowmoss`）
- 資料：移除 `quest_forest_001`–`003`、苔咚（`boss_moss_thump`）、霧孢飛蛾、根鬚甲蟲與祕林的 9 個生成點（迷霧芽怪留在晨曦谷地）、13 種舊任務物件的 prefab 與 20 個 placement（`gen-glowmoss.ts` 輸出時濾掉，地形與點綴保留到 12B）、水道（`waterways.json`、`waterway.ts`、`Waterway.tsx`、`waterwayRuntime.ts`）、`MossThump.tsx`、林間水道地標、只屬於舊任務的對話、芽芽提示與 98 個翻譯 key。
- 琳娜搬回晨曦村（米菈旁），對話一開始就有「借用草藥桌」，送信改在村裡交；奇奇搬到澄鏡湖營地（伊芙旁），接 `quest_lake_002` 的流程不變。月露藥膏的配方與商店改為第一章完成後解鎖。
- 過渡條件（T-187）：澄鏡湖入口與 `quest_lake_001` 只要求 `quest_dawn_003`；奧林的對話把「燈塔下的影子」排在澄鏡湖委託之前（否則第一章一完成就被推去澄鏡湖）。
- 存檔 v18：清掉舊森林任務紀錄（新主線會沿用 `quest_forest_001`–`003` 的 id）、芽之共鳴、20 個舊物件、苔咚的擊敗紀錄與舊生成點。
- 共用規則的測試保留：頭目 AI、戰場物件與護盾、盤旋與縮殼行為改用測試樣本 `src/game-core/testing/legacyForest.{json,ts}`（從 git 取出的舊資料）；刪除 `forestGuard.test`、`forestQuests.test`、`waterway.test`。
- e2e：刪除 `boss`、`forestguard`、`forestquest`、`forestmobs`（`e2e:all` 剩 42 個）；`craft`、`letters`、`mirrorlake`、`lakequest`、`lightpuzzle`、`liyi`、`puffking` 改前置條件。截圖腳本移除 `--waterway`、`--boss`、`--guardian`。`mistwood-verify` 對照表與 CLAUDE.md 同步。
- 測試：`pnpm check`（Vitest 940 項）、`pnpm build` 通過。e2e 跑 14 個受影響的 suite：`save`、`craft`、`letters`、`mirrorlake`、`lakequest`、`lightpuzzle`、`liyi`、`puffking`、`cellar`、`glowmoss`、`map`、`monsters`、`npc` 全過；`world` 的「迷霧時畫面去飽和」失敗 1 項（0.822 → 0.871），**改動前的版本在同一時間也失敗**（0.817 → 0.870），見「已知問題」。沒有截圖（12A 只移除內容，12B 換地形時再拍）。

### 第二章 Phase 0：盤點（2026-10-20）
- `docs/chapter02/PHASE0_INVENTORY.md`：技術盤點（重用 / 擴充 / 新建）、資產盤點、差距清單、裝備系統規劃、Phase 1 拆成 12A–12E 與檔案變更計畫。
- 重點：prefab 的 `activate`（可消耗物品）、`turn`、`read`、`harvest` 與任務系統已涵蓋燈柱、水輪、石碑、採集點；`lightPath.ts` 可做星晶反射；史萊姆可用 `spit` ＋ `splitInto`。沒有：翻滾閃避、迷霧持續傷害、可推動石塊與壓力板、圖鑑、裝備層（武器是 7 種固定類型，`water_charm` 效果寫死在 `Player.tsx`）。
- 受影響的既有功能：澄鏡湖入口與 `quest_lake_001` 都要求 `quest_forest_003`；`quest_dawn_004` 的信要送到祕林的琳娜；9 個 e2e suite 要改寫或調整。
- 裝備系統規劃（使用者要求）：武器 / 防具 / 飾品三格、`items.json` 新類別 `equipment`、`equipmentModifiers` 純函式套用在 `enemyStrike` 與 `rollLoot`、存檔 v18；排在規格 Phase 2（聚落工作台）。
- 旅行商人改名伊索（`npc_iso`），已提交（`459b026`）。
- 只讀程式，沒有改程式，沒有跑測試。

### 第二章改版：設計文件（2026-10-20）
- 使用者提供第二章規格書（`docs/CHAPTER_02_GLOWMOSS_WOOD_SPEC.md`）與 9 張參考圖（`docs/art/reference/螢苔祕林/`，`docs/art/` 由使用者加入 `.gitignore`），選擇以規格**取代**既有螢苔祕林。
- Bible §6 重寫：七區 A–G、四位 NPC、主線 `quest_forest_001`–`008`、支線 `009`–`014`、三個謎題、四種怪物＋枯根守衛、三階段頭目根噬者、道具與裝備、章節結尾；舊版內容列在 §6.15。同步改 §3.1 / §3.2（澄鏡湖開放條件）、§14 P2、§16、§22.2（舊支線停用）、§23、§28.2、§29.3、§30.2 與 recipe。
- GAME_DESIGN：§2.2 地圖表（螢苔祕林標為「設計已改、程式待重做」，澄鏡湖改新條件）、§2.3 角色表（新增四位 NPC，琳娜回第一章、奇奇從第三章登場）、§9 路線圖新增「第二章改版」。
- DECISIONS：T-185（改版範圍與 ID 慣例）、T-186（澄鏡湖入口與芽之共鳴：淨化根噬者後芽之共鳴在古樹核心中甦醒，完成 `quest_forest_008` 才開放澄鏡湖）。CLAUDE.md 文件清單加入規格書。
- 旅行商人規格書原名「托托」，與石匠鼴鼠 `npc_toto` 撞名，使用者決定改名為伊索（`npc_iso`）。
- 只改文件，沒有改程式，所以沒有跑測試。
- **程式與文件暫時不一致**：Phase 8 的舊實作（苔咚、水道謎題、琳娜 / 奇奇的任務）與澄鏡湖的舊開放條件仍在程式中，依 Bible §6.15 在之後的任務替換。

### 部署與登入檢查（2026-10-20）
- 正式站曾被 `2f32ad4`（OAuth 之前的版本）的 Production 部署蓋掉；已用 Vercel CLI 把 `0c7e1c2` 的部署（`dpl_2ehjJRyoc4h5AQPhHf8mPkwyBts3`）升回正式版，確認網站有 Google / LINE 按鈕。
- Google 登入：使用者修正 Google Cloud 的 redirect URI 與 Supabase 的 Client Secret 後可以登入。
- LINE 登入：仍失敗，Supabase 回 `Error getting user profile from external provider`（在換到 token 之後向 LINE 取使用者資料時失敗）。`auth.custom_oauth_providers` 的 `custom:line` 設定（issuer、discovery、scopes、client id、PKCE）都正確；使用者決定先擱置。
- 程式問題（未修）：Supabase 把錯誤放在網址的 `#` 後面，`accountStore.ts` 的 `completeWebRedirect` 只讀 `?` 參數，錯誤訊息不會顯示在畫面上。

### 任務 11L-3：Google / LINE 登入、啟動時對時（2026-10-17）
- 線上登入改成 Google 與 LINE 的 OAuth（T-184），移除 Email 驗證碼。網頁版整頁導向；桌面版用系統瀏覽器、導回 `127.0.0.1:53682`（`electron/oauthLoopback.ts`）。同信箱的帳號由 Supabase 自動合併。
- **待使用者**：Google Cloud 建 OAuth client、LINE Developers 建 LINE Login 頻道（要申請 Email 權限）、Supabase 開啟 Google 與自訂 OIDC `custom:line`、Redirect URLs 加入正式 / 預覽 / 桌面版網址。步驟見 `docs/multiplayer/accounts.md`「設定」。
- 共享日光補強：啟動時向遊戲伺服器 `/health` 對時，單機也用伺服器時間（T-181 補充）。正式站要等這個 PR 合併、Render 重新部署後才會同步。
- 測試：新增 `electron/oauthLoopback.test.ts`、`src/net/serverTime.test.ts`。`account` e2e 改為檢查停用時沒有登入按鈕。

### 任務 11H：共享日光、四種初始職業、地圖全開（2026-10-17）
- 共享日光（T-181）：一天的時刻改由世界時鐘決定（`worldClockAt`，從 2026-10-17 日出起算、一天 24 分鐘真實時間），所有人看到同一個時刻；線上以伺服器的 `time` 訊息校正時差。`GameState.clock` 不存檔；遊玩時間 `time` 仍驅動重生、回復與生長。睡覺不再跳時間，茉莉的床只回復體力。
- 四種初始職業（T-182，`src/data/classes.json`）：旅人（短刀 / 劍、星光法術）、晨光騎士（雙手劍、聖光法術）、霜語法師（法杖、冰火奧術）、荒原戰士（斧 / 雙手斧、戰吼與地震）。新遊戲與第一次進線上世界時選職業（`ClassPicker`），規則層限制職業的武器與法術；存檔 v17（`loadout.heroClass`）；線上同步職業，其他玩家看到對應模型。
- 地圖全開（T-183）：小地圖與世界地圖移除探索遮罩，地名、地標、寶箱全部顯示；3D 的區域迷霧與任務限定的地標保留。
- 測試：`pnpm check`（Vitest 974 項）、`pnpm build` 通過。e2e 未在雲端執行（容器只有軟體繪圖，約 1–2 fps）；需要在本機跑：`daynight`、`map`、`save`、`dev`、`settings`、`account`、`melee`、`magic`、`multiplayer`、`cellar`、`garden`。

### 任務 11L-2：主選單分單機 / 線上、線上入口（2026-10-17）
- 主選單上方切換「單機遊玩 / 線上遊玩」（記住上次的選擇）；線上頁：信箱 → 驗證碼（通過後直接成為已登入）→ 第一次取顯示名稱 → 進入線上世界；停權、維護（gm / admin 不受限）、讀取失敗各有提示；`game_config.motd` 顯示在標題下方。T-180，流程見 `docs/multiplayer/ui-flow.md`。
- 線上的一局：讀寫 `characters`（`revision` 防止兩處互相覆蓋，衝突時提示並停止存檔）、場景就緒後以顯示名稱自動連線、`player_sessions` 遊玩紀錄（每分鐘更新）；暫停選單顯示目前模式，線上不提供匯出。單機的一局只用本機存檔，沒有連線入口。
- 移除 11G 的本機 ↔ 雲端同步與帳號視窗。使用者的帳號（yiso05255@gmail.com）已設為 `admin`。
- 測試：Vitest 898 項（新增 `game-core/online/rules.test.ts` 7 項，移除同步的 4 項）。e2e：`account` 改寫為主選單模式切換（4 項）、`save` 12、`settings` 9、`dev` 9、`multiplayer` 17 全過。截圖 `docs/screenshots/phase11/menu_title.png`、`menu_title_online.png`、`menu_pause.png`。
- 完整 e2e（改到 `vite.config.ts`）：41 個 suite 全過。`pnpm e2e` 連跑時 `melee` 的「fist 右鍵重擊」一次沒打中（48 → 48），單獨重跑 13 項全過，視為偶發（戰鬥程式這次沒改）；連跑因此中斷，其餘 26 個 suite 另外逐一跑完、全過。
- 未自動化：真正的登入、取名、線上存檔與兩處衝突需要實際信箱與資料庫，由使用者手動測（步驟見 `accounts.md`「手動測試」）。

### 任務 11L-1：線上資料表（2026-10-17）
- 使用者決定：線上一定要登入、線上只用資料庫、單機只用本機存檔（T-179，取代 T-178 的同步）；之後要有簡易後台。
- Supabase 新增 9 張表：`profiles`（註冊自動建立）、`characters`（線上角色，`revision` 樂觀鎖）、`game_config`、`announcements`、`mail`（`claim_mail()` 領附件）、`chat_reports`、`moderation_actions`、`player_sessions`、`admin_audit_log`；角色 player / gm / admin，權限全由 RLS 與觸發器保證，後台不需要 secret key。既有 `saves` 的 2 筆複製成線上角色，`saves` 保留。
- Migration 進 repo：`supabase/migrations/20261017090000_online_core.sql`、`20261017091000_online_core_tuning.sql`；型別 `src/account/database.types.ts`；說明 `docs/multiplayer/database.md`。
- 驗證：以 SQL 模擬玩家 A / B、gm、admin、未登入共 42 項權限測試全部符合預期（單一交易、結束後回滾，沒有留下測試資料）；Security advisor 只剩「密碼外洩保護」（只用驗證碼登入，不適用）。
- 前端在 11L-2 改為線上入口。

### 任務 11G：帳號與雲端存檔（2026-10-16，進行中：尚未推上線）
- Email 6 位數驗證碼登入（`signInWithOtp` / `verifyOtp`，只在標題畫面登入）；Supabase 表 `public.saves`（每帳號一列、RLS 只允許本人，anon 無權限，advisor 無警告）；登入後比對本機與雲端（`planSync` 純函式：同版不動、單邊同步、不同版問玩家）；登入中每次存檔上傳雲端。設定與手動測試步驟見 `docs/multiplayer/accounts.md`，決策 T-178。
- 測試：Vitest 895 項（`game-core/save/sync.test.ts` 4 項）。e2e 新增 `account`（3 項，測試建置沒有設定 Supabase 時面板顯示停用、標題與暫停選單都有入口）；`save`、`settings`、`dev`、`multiplayer` 重跑全過。真實寄信與驗證需要實際信箱，由使用者手動測（未自動化）。
- 尚未做：遊戲伺服器驗證 Supabase JWT（留到聊天帳號層級時）。

### 任務 11F：多人連線——聊天（2026-10-16）
- 附近（同地圖、同室內、30 m）、全服、密語（`/w 名字 訊息`）、系統訊息（加入、離開、說話太快等）；左下角聊天紀錄（平時最近 6 則、10 秒後淡出，開著時可捲動），Enter 或 `/` 開啟、Enter 送出、Esc 取消、Tab 切換附近 / 全服；頭上的對話泡泡（自己與其他人，5 秒）；`/mute`、`/unmute` 本機靜音。協定升到版本 3（T-177）。
- 伺服器：清理文字、髒話遮蔽（`src/data/chatBlocklist.json`，名字也套用）、每秒 2 則 / 每 10 秒 8 則 / 全服每 5 秒 / 5 秒內重複擋下並告知；全服最近 20 則給新加入的人。
- 測試：Vitest 891 項（`WorldRoom.test.ts` 新增 6 項：附近的距離與地圖、全服與冷卻與紀錄、密語與找不到與同名、清理與過濾與名字、頻率與重複與格式、加入離開；`chat.test.ts` 12 項）。端對端 `multiplayer` 擴充到 17 項（A 用鍵盤說話、B 收到並看到泡泡、自己也有泡泡；B 打字時不移動不施法、Esc 不開暫停選單、關掉後能走；60 m 外聽不到附近頻道、全服與密語）全過；`settings`、`dev`、`movement` 重跑全過。
- 完整 `pnpm e2e`（2026-10-16）：`multiplayer` 之前的 suite 全過（349 項）。`multiplayer` 第一次跑時 B 視窗建立 WebGL context 失敗、啟動逾時（環境問題，程序停住，已停止）；單獨重跑時「密語」一項發現測試在 B 收到回顯前就讀取紀錄，改成等 B 的紀錄出現後再讀，之後 `multiplayer` 17 項與 `dev` 9 項全過。
- 截圖 `docs/screenshots/phase11/chat.png`（已檢視：A 頭上的泡泡、左下角的紀錄與系統訊息、「Enter 聊天」提示，沒有擋到體力條）。

### 任務 11E：多人連線——攻擊與施法的同步（2026-10-15）
- 使用者在正式網址試玩回報：拳、刀砍、魔法對方都看不到。協定升到版本 2：`action`（近戰招式、施法的蓄力與發動）與 `equip`（武器）；伺服器檢查格式、資料 id、每秒最多 8 則後轉送給其他人，不結算傷害（T-176）。
- 遠端玩家：手上顯示對方裝備的武器；出招時播放同一招的動畫與揮砍拖尾；施法時拿魔杖、在對方位置畫出魔法陣、衝擊波、星光彈、流星（只是表現，不命中本機的怪物）。動作依送出時間在呈現到那一刻才播放，與插值後的位置對齊。
- 測試：Vitest 873 項（`WorldRoom.test.ts` 新增 4 項：轉送與不回送、未知招式 / 法術與多餘欄位被拒、每秒 8 則上限、武器；`netStore.test.ts` 2 項：動作依時間取出、過舊的丟掉）。端對端 `multiplayer` 擴充到 14 項（B 看到 A 拿短刀並播放 `1H_Melee_Attack_Stab`、施放星屑飛彈時拿魔杖且有飛彈但 B 的命中數不變）全過；`melee`、`magic`、`combat` 重跑全過。未跑完整 e2e。
- 截圖 `docs/screenshots/phase11/multiplayer_spell.png`（已檢視：A 腳下的魔法陣與施法光芒）。
- 完整 `pnpm e2e`（2026-10-15）：前面 45 個 suite 全過（`multiplayer` 之前）；`multiplayer` 的「A 走路時 B 看到 A 平滑地移動」一項失敗一次（插值速度跳到 18.9 m/s，當時機器負載約 8），之後 `e2e:all` 中止。單獨重跑 `multiplayer` 兩次都全過；`dev` 單獨跑過。這項是機器忙時的抖動（同 11D 的紀錄），仍列在「已知問題」。
- 「有時頓頓的」：到 Render 的 TCP 連線約 20 ms，一次 HTTPS 請求 170–220 ms（含 TLS 與轉到新加坡）。遠端玩家的呈現延遲會依抖動在 100–300 ms 之間自動調整（T-173）；免費方案的 CPU 很少，但伺服器只轉送位置、負載很低。另一個可能是瀏覽器本身的 FPS（e2e 截圖的 FPS 面板 26、draw calls 468）。還沒在使用者的瀏覽器量測，見「已知問題」。

### 任務 11D：多人連線——部署設定（2026-10-15，〈多人連線規劃〉Phase 4，程式部分）
- `render.yaml`（Render Free 新加坡、`main` 自動部署、`/health`）、`vercel.json`（Vite、`dist`、長效快取）、`docs/multiplayer/deploy.md`（環境變數、第一次部署步驟、Electron 連正式伺服器、本機模擬）；`.env.example` 加上 `ALLOWED_ORIGINS`。
- 伺服器的連線來源允許清單（`server/origins.ts`）：比對房間（static `onAuth`）、WebSocket 升級、CORS 三處檢查（T-175）。連線等待超過 4 秒時提示伺服器可能在休眠中醒來。
- 測試：Vitest 新增來源清單 4 項、實際請求 4 項。乾淨目錄模擬 Render 的安裝 / 建置 / 以 `PORT`、`ALLOWED_ORIGINS` 啟動：`/health` 正常、允許的來源 200、其他網站 403、Electron 的 `null` 200；模擬 Vercel 建置：CSP 加入 `wss://` 與 `https://` 的伺服器網址。`multiplayer` e2e 改用正式的來源設定（只允許 Vercel 網址與 Electron 的 `null`、`file://`）、加上喚醒提示的檢查：12 項全過；`multiplayer-web` 2 項全過。`pnpm check` 867 項全過。未跑完整 e2e。
- 完整 `pnpm e2e`（46 個 suite）：前 44 個全過；`multiplayer` 3 項失敗（上面的 `minUptime`，已修正），整組在此中止；`dev` 另外單獨跑過全過。修正後 `multiplayer` 在機器負載正常（load average < 6）時連跑 2 次全過；負載 34–42（使用者的 Chrome 分頁佔滿 CPU、加上連跑測試）時「走路平滑度」失敗 2 次、一次全部連不上，負載下降後通過——不是程式問題，但機器很忙時這項會不穩。抖動那項的判準放寬為後半段最多一次 ≤ 1.2 m 的追趕（代理的延遲會排隊累積，偶爾超過 300 ms 上限，T-173）。
- 尚未上線：需要建立 Vercel 專案與 Render 服務，見「下一步」。

### 任務 11C：多人連線——斷線續玩（2026-10-15，〈多人連線規劃〉Phase 3）
- 伺服器：非自願斷線 `onDrop` 保留座位 20 秒、狀態 `online: false`；`onReconnect` 恢復並允許下一則 warp；逾時才移除（T-172）。
- 客戶端：SDK 自動重連（約 15 秒內）回同一個 session；座位沒了（伺服器重啟、休眠喚醒）自動重新加入，最多 3 分鐘後才顯示「重新連線」；狀態「重新連線中…」；重連中不送位置；關閉視窗時主動離開。遠端玩家斷線時停在原地、名牌變淡並標示「（連線不穩）」，多人連線面板的名單也標示。
- 依抖動調整的呈現延遲 100–300 ms（`AdaptiveDelay`，T-173）。依出入口資料驗證瞬移落點延到 Phase 6（T-174）。
- 測試：Vitest 859 項（新增呈現延遲 3 項、房間斷線續玩 4 項）；修正 `server/WorldRoom.test.ts` 兩項既有測試的偶發失敗（`@colyseus/testing` 的 `waitForNextMessage` 會被前一則訊息排的 timer 提早 resolve，改為輪詢；完整 `pnpm test` 修正後連跑 3 次全過）。端對端 `multiplayer` 擴充到 12 項：e2e 內建 TCP 代理，剪斷 A 的網路 5 秒（A 顯示重新連線中且能走動、B 看到 A 停在原地與「連線不穩」、沒有離開通知）、恢復後同一個 session 回來、加上 0–150 ms 抖動時呈現延遲拉長且移動連續、伺服器重啟後自動重新加入。`multiplayer-web`（2 項）重跑全過。未跑完整 e2e。
- `multiplayer` 第一次跑時 4 項失敗（重連後換了 session 與連帶的三項），當時原因不明；之後在完整 e2e 再出現，診斷紀錄找到根因：SDK 的 `minUptime` 預設 5 秒，A 加入約 5 秒時被剪網路，SDK 不重連、改走重新加入。改成 1 秒（T-172），e2e 改為固定在 A 重新加入 1.5 秒後剪網路，每次都測到這個情況。

### 任務 9F：風語草原——地圖與場景（2026-10-15，Bible §8）
- 第四張地圖（世界座標 (6000, 0)，沿用 320 m，T-165）：西側入口的古風帆、起伏草原與野花坡、風車聚落（三座停擺的風車、農舍、穀倉、水井、農田）、北邊陡峭的浮石山脊（頂上的浮石，走不上去）、東側台地上的舊風向塔與風帆平台（從西側緩坡走上去）、北端的風之巨偶競技場、彎月石拱、受風傾斜的樹；5 個新區域與迷霧；存檔 v16。
- 澄鏡湖東岸的古風帆：完成 `quest_lake_003`（喚醒潮之共鳴）才能通過，世界地圖的地標也在那之後出現；草原西側的古風帆回澄鏡湖。
- 散佈物與邊界樹的 placement id 用 `wm_` 前綴（原本的 `meadow_tree` 等和晨曦谷地的草原衝突，產生腳本會報 id 重複）。既有的 placement 都沒變，只移除澄鏡湖東岸與古風帆重疊的 1 顆石頭。
- 測試：Vitest 852 項（`maps.test.ts` 改成 4 張地圖、古風帆的出入口與條件、草原 placement 的地形與區域；`save.test.ts` v15 → v16）。端對端新增 `meadow`（10 項：古風帆上鎖與說明、轉場與抵達點、地圖與區域名稱、沿小徑跑、風車聚落、從緩坡走上台地、山脊爬不上去、存檔、讀檔、回澄鏡湖）；mirrorlake、map、save 重跑全過；未跑完整 e2e。多人連線的伺服器依 `mapIdAt` 判斷地圖，草原自動支援（`protocol.md` 已更新）。
- 截圖 `docs/screenshots/phase9/meadow_*.png`、`mirrorlake_sail.png`（已檢視；修正：競技場外圈的石墩擋在小徑入口 → 南側留缺口；彎月石拱右腳懸空 → 曲線延伸到地面；風帆平台的木梯方向反了 → 越靠近平台越高，碰撞一致；風車聚落書籤的鏡頭在山坡裡 → 拉高）。

### 文件：雙人連線整體規劃（2026-10-15）
- `docs/multiplayer/online-plan.md`：服務與技術總表、系統架構圖、連線 / 斷線續玩 / 部署 / 雲端存檔流程圖（Mermaid）、環境變數、Phase 3–6 路線圖與驗收、安全與限制、待決定事項。`LAUNCH_PLAN.md` 的多人部分改指向這份。

### 任務 11A–11B：多人連線——Colyseus 伺服器、在場玩家與移動同步（2026-10-15，〈3D RPG 多人連線技術規劃〉Phase 0–2）
- 伺服器 `server/`（Colyseus 0.18，獨立 Node 程序，`pnpm dev:server` / `start:server`，`/health`）：單一世界房間 `world`、玩家 id 與出生點、加入時帶目前位置、離開移除；每則移動以 zod 檢查格式、每秒 30 則上限、伺服器時鐘驗證速度與可玩範圍，不通過就送 `correction` 拉回；合法瞬移（換地圖、室內、重生、讀檔）走 `warp`（T-166–T-169）。
- 共用協定 `src/game-core/net/`（協定、移動驗證、插值與時鐘同步，純函式）；客戶端 `src/net/`（Web 與 Electron 同一份，唯一 import Colyseus SDK 的地方）：連線 / 中斷 / 重新連線、每 50 ms 回報位置、套用修正。`Player.tsx` 新增 `warpSeq`、`positionAt`。
- 遠端玩家 `RemotePlayers.tsx`：在送出端時間軸上插值（呈現延遲 100 ms，T-170）、移動動畫、`Html` 名牌、只顯示同地圖同室內的人。UI：暫停選單「多人連線」面板、小地圖下方連線狀態（人數、斷線原因、重新連線）、加入 / 離開通知；`?mp=1&mpName=` 自動連線；回主選單中斷（T-171）。CSP 依 `VITE_GAME_SERVER_URL` 加入伺服器來源；`.env.example`。
- 測試：Vitest 831 項（新增 `moveValidation.test.ts` 7 項、`interpolation.test.ts` 8 項、`server/WorldRoom.test.ts` 10 項以 `@colyseus/testing` 啟動伺服器、i18n 連線狀態）。端對端新增 `multiplayer`（9 項：兩個 Electron 連同一房間、看得到模型與名牌、走路時對方每一幀連續且與本機一致、瞬移座標被拒並拉回、格式錯誤被忽略、換地圖後不顯示、關掉一邊後移除、伺服器停止時離線且能走動、重啟後重新連線）與 `multiplayer-web`（2 項：`vite preview` + Chromium 兩個分頁，不在 `e2e:all`）；連跑 `multiplayer` 多次都過。完整 `pnpm e2e`（45 個 suite）：`combat` 在整組連跑時 2 項失敗（向雷歐回報那一步 `waitForFunction` 逾時，第二項是它的連帶結果），整組在此中止；單獨重跑 `combat` 9 項全過，再接著跑之後的 34 個 suite 全過（247 項、含 `multiplayer` 與 `dev`）。合計 45 個 suite 通過（`combat` 為單獨重跑）。
- 截圖 `docs/screenshots/phase11/multiplayer_two.png`（已檢視：A 的模型與名牌、「已連線 2 人」）。
- 已知問題：`combat` 在整組連跑時偶爾逾時（單獨重跑通過，記憶體 / 負載壓力，與多人連線無關的程式路徑）。同一台電腦開兩個 Electron 與伺服器、機器忙時，遠端玩家偶爾停約 0.1 秒再追上；`multiplayer` 的「A 走路」一項曾有一次 A 沒收到 W 鍵（背景視窗的鍵盤輸入），重跑通過。遠端玩家與本機同造型、不同步攻擊動作；新遊戲的玩家出生在同一點會重疊。

### 完整 e2e（2026-10-15，任務 9E-2 之後）
- `pnpm e2e`：44 個 suite 全過（348 項檢查、0 失敗）。

### 任務 9E-2：潮之共鳴與戰後的璃漪（2026-10-15，Bible §7.4、§7.5）
- 擊敗璃漪後喚醒神殿中央的潮之共鳴裝置（取得潮之共鳴）；戰後的璃漪（Bible 戰後台詞）；回報伊芙後解鎖湖泊家園裝飾（蘆葦盆栽、鏡殼燈）（T-164）。Phase 9 澄鏡湖的主線 `quest_lake_001`–`003` 完成。
- 測試：Vitest 806 項（`liyi.test.ts` 擴充到 6 項）。端對端 `liyi` 擴充到 9 項（戰後的璃漪、喚醒裝置、回報與建造選單）；forestguard、garden、build、boss 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase9/liyi_after.png`（已檢視；修正：裝置亮起時顯示的是苔咚根源石的提示 → 依頭目換文字與顏色；鯉龍的頭是黑色 → 補上頂點色）。

### 任務 9E-1：璃漪，回聲鯉龍（2026-10-15，Bible §7.5）
- 頭目戰：水柱、回聲波、尾部水浪；倒影分身減傷，蓄力時轉動神殿兩側的水鏡讓真身顯形（暈眩）；`quest_lake_003`（伊芙）任務中才開戰（T-163）。
- 測試：Vitest 802 項（新增 `liyi.test.ts` 5 項）。端對端新增 `liyi`（6 項：沒接任務不開戰、開戰與 HUD、倒影減傷、水鏡顯形、水柱命中、擊敗）；puffking、boss、forestguard、lakemobs 重跑全過（`lakemobs` 的霧鷺影一次沒打中玩家而逾時，加上重新靠近後連跑兩次全過）；未跑完整 e2e。
- 截圖 `docs/screenshots/phase9/liyi_*.png`（已檢視；第一次開戰點在觸發範圍外沒有開戰 → 移近；牠會穿過外圈斷柱 → 戰場半徑 9.5 改 8）。

### 任務 9D：水鏡光路謎題「把水送回遠方」（2026-10-15，Bible §7.4）
- `quest_lake_002`（奇奇）：轉動三面水鏡（每次 90 度），讓曙光石的光一路照到湖底閘門，閘門升起；光路畫在場景上；回報得到水行護符（可以走進 2.2 m 深的水）、湖岸迷霧變清（T-162）。
- 測試：Vitest 796 項（新增 `lightPuzzle.test.ts` 4 項）。端對端新增 `lightpuzzle`（6 項：沒接任務不能轉、接任務、曙光石亮起與光束、轉三面鏡子打開閘門、沒有護符會落水、回報後帶著護符走進深水）；mirrorlake、lakequest、forestquest、puffking、lake、movement、save 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase9/lightpuzzle_*.png`（已檢視；第一張原本被樹擋住，換了角度）。

### 任務 9C：伊芙與「湖面不肯忘記」（2026-10-15，Bible §7.4、§21.5）
- 伊芙（水獺族，湖畔營地）；`quest_lake_001`：奧林在苔冠下的守衛之後交付，調查澄鏡湖的三處倒影（調查時顯示倒影裡的景象），回報領水鏡符號紀錄（T-161）。
- 測試：Vitest 790 項（新增 `lakeReflections.test.ts` 4 項）。端對端新增 `lakequest`（4 項：接任務、伊芙、調查三處倒影、回報）；cellar、npc、quest、journal、map、mirrorlake、footprints、forestquest、world 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase9/mirrorlake_eve.png`、`mirrorlake_reflection.png`（已檢視；營地的倒影原本落在草地上、剪影有影子 → 移到水邊、不投影）。

### 任務 9B：澄鏡湖的怪物（2026-10-15，Bible §7.6）
- 水泡精（噴水泡緩速、被打破時分裂成兩隻小水滴）、霧鷺影（遠距離擲霧羽、擲完向後瞬移、前搖時單腳站立低頭）、鏡殼蟹（正面鏡殼減傷 75%、出手後掀殼露出弱點）；7 個生成點；新材料湖珠、水之精華、霧羽、鏡殼片（T-160）。晨曦谷地溪流的水泡精一併換成新版本。
- 測試：Vitest 783 項（新增 `lakeMobs.test.ts` 12 項）。端對端新增 `lakemobs`（4 項：生成、分裂、霧鷺影瞬移與緩速、鏡殼蟹正面 / 側面傷害）；monsters、forestmobs、combat、melee、magic、boss 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase9/monster_mob_*.png`（已檢視）。

### 完整 e2e（2026-10-15，任務 9A 之後）
- `pnpm e2e`：40 個 suite 全過（325 項檢查、0 失敗）。

### 任務 9A：澄鏡湖——地圖與場景（2026-10-15，Bible §7）
- 第三張地圖（世界座標 (4000, 0)，T-159）：湖畔營地與漁屋、木碼頭與燈船、淺水石徑（涉水到湖心的神殿島）、月弧木橋與倒影蘆葦島、三面水鏡、半沉沒鐘樓、水鏡遺構、水鏡神殿；湖水藍的水面與白藍色薄霧；5 個新區域與迷霧；存檔 v15。
- 螢苔祕林小渠南端的水道入口：完成「苔冠下的守衛」才能通過；澄鏡湖北邊的林間水道出口回螢苔祕林。
- 測試：Vitest 772 項（新增 `mirrorlakeTerrain.test.ts` 6 項、地圖 / 出入口 / 存檔遷移各補測試）。端對端新增 `mirrorlake`（10 項：入口條件、轉場、區域名稱、淺水石徑涉水、深水回安全點、月弧木橋、神殿濃霧、存檔、讀檔、回螢苔祕林）；glowmoss、map、save、region、bounds、forestguard、world、dev、lake 重跑全過。
- 截圖 `docs/screenshots/phase9/mirrorlake_*.png`（已檢視；修正：神殿石台上長草 → 加扁圓柱碰撞；遺構台基有一條直線的落差 → 改成平滑過渡；入口書籤原本在邊界外）。
- 完整 e2e（7P 之後）：前 33 個 suite 全過；`map` 因為執行中途改了 `SAVE_VERSION`（e2e 會讀原始碼）而失敗、整組中止——是操作造成，不是程式問題。9A 提交後重跑完整 e2e 全過（見「完整 e2e（任務 9A 之後）」）。

### 任務 7P：動物居民的造型（2026-10-15，Bible §4、§21）
- 米菈、波木、琳娜、奇奇、尼可、桃樂改為程式造型的動物（兔、熊、鹿、狸貓、刺蝟、兔），依 Bible 加上圍巾、記錄板、背心、木槌、花草披肩、護目鏡、大手套、郵差包與信筒、草帽與圍裙等（T-158，`world/entities/npc/AnimalVillager.tsx`）。對話、任務、地圖標記不變。
- 測試：Vitest 749 項。端對端 npc、quest、letters、garden、forestquest、forestguard、lighthouse、shop、craft、cellar、companion、journal、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/npc_*.png`、`letters_niko.png`、`garden_tao.png`（已檢視；琳娜第一版像小狗，加大耳朵與白斑；尼可從正面看不到刺，頭頂加一圈刺）。

### 任務 7O：找到回家的路（2026-10-15，Bible §5.4）
- `quest_dawn_001`（主線，沒有發起人，T-157）：打開序章寶箱時開始，走進晨曦村自動完成、星光碎屑 × 3；新任務目標 `visit`、寶箱 `startsQuest`；世界地圖標出村子、芽芽的提示。
- 測試：Vitest 749 項（新增 `homeward.test.ts` 3 項）。端對端 `companion` 新增 1 項（開寶箱開始、走進村子完成）；tutorial、quest、map、journal、world、harvest、save、dev 重跑全過；未跑完整 e2e。

### 任務 7N：村屋窗燈（2026-10-15，Bible §5.3、§16）
- 夜晚村屋的窗戶亮起暖黃光、白天不變（T-156）：`render/windowGlow.ts`（材質的 shader 修改，只作用在窗戶的色票格）、`WindowGlowDriver`、prefab `nightWindows`（12 種建築）。新增 `nightAmount`（夜晚的程度），燈塔光柱改用它（原本用的 glow 是黃昏光暈，夜裡光柱幾乎看不到）。除錯 API `windowGlow()`。
- 測試：Vitest 746 項。端對端 `daynight` 新增 1 項（白天 0、夜晚亮、材質都加上窗燈）；lighthouse、tavern、world、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/daynight_*.png`（已檢視：21 點村子的窗戶亮起，白天不變）。

### 任務 7M：奧林與「燈塔下的影子」（2026-10-15，Bible §4.7、§22.1）
- 奧林（程式造型的貓頭鷹史學家）在古樹遺跡；`quest_dawn_007`（角色故事）：燈塔點亮後接取 → 白天按 E 地窖門會說明要等夜裡 → 夜裡下到燈塔地窖（第二個室內子場景）→ 撿三塊符號石片 → 放回石環（晨、芽、潮亮起，風、霜空著）→ 從石階上來回報奧林 → 共鳴石板、種籽幣 × 40（T-155）。
- 出入口條件 `questActive`、`night`，室內出入口也檢查條件。新程式模型：地窖（石室、石階、燈座）、地窖門、三種符號石片、石環（空 / 放回）、貓頭鷹 NPC。新物品與圖示：三種石片、共鳴石板。placement 附加 7 個（地窖內 6、地窖門 1）。截圖旗標 `--cellar`。
- 測試：Vitest 746 項（新增 `cellar.test.ts` 4 項；`interiors.test.ts` 加入地窖）。端對端新增 `e2e/cellar.e2e.mjs` 5 項；tavern、lighthouse、glowmoss、npc、quest、bounds、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/cellar_*.png`（已檢視；第一版直接傳送進地窖，戶外的霧沒關，看起來什麼都沒有——截圖改為從地窖門走進去；石磚縫透出背景，加上實心牆）。

### 任務 7L：河邊的腳印（2026-10-15，Bible §22.1）
- `quest_dawn_006`（支線，沒有發起人，T-154）：燈塔點亮後在碎光溪西岸按 E 調查腳印（被咬過的蘋果與淡淡光點）自動開始 → 摘兩顆野果（新的野果叢，會重生）→ 放在樹根下的小窩旁 → 馬上觀察會提示「先離開一陣子」→ 90 秒（遊戲時間）後回來悄悄觀察 → 任務自動完成、軟足印吊飾；角兔幼崽之後住在小窩旁（程式造型、泡泡音）。
- 新程式模型：腳印與蘋果、野果叢（有果 / 摘完）、小窩（空 / 有野果）、高草叢、角兔幼崽。新物品與圖示：野果、軟足印吊飾。placement 附加 6 個（移除重疊的散佈點綴 6 個）。截圖旗標 `--footprints`。
- 測試：Vitest 735 項（新增 `footprints.test.ts` 5 項；`forestQuests.test.ts` 的機關存檔加上 `activatedAt`）。端對端新增 `e2e/footprints.e2e.mjs` 4 項；forestquest、forestguard、lighthouse、quest、npc、harvest、save、journal、letters、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/footprints_*.png`（已檢視；第一版腳印藏在草叢裡看不到，改成石頭上的蘋果加光點）。

### 任務 7K：桃樂與「花園第一顆種子」（2026-10-15，Bible §21.2、§22.1）
- 桃樂（`tao`）：木橋修好後出現在湖邊（初遇說出 Bible 台詞）。`quest_dawn_005`（角色故事）：接取拿到 2 顆野花種子 → 在西坊農田按 E 挖鬆土 → 到家園小島按 B 蓋花圃（木材 × 4、鬆土 × 3、種子 × 1，放下就算種下）→ 回報桃樂（Bible 台詞）→ 野花種子 × 3、種籽幣 × 15。
- 系統（T-153）：任務目標 `build`、建造物 `unlock`（接過任務才出現）與 `growth`（依遊戲時間換三個階段的模型：剛種下、長葉與花苞、開花）、建造物 `placedAt`。新程式模型：花圃三個階段、鬆土堆。新物品與圖示：鬆土、野花種子。placement 附加 3 個（田邊鬆土）。除錯 API `buildingStage(id)`；截圖旗標 `--garden`。
- 測試：Vitest 725 項（新增 `garden.test.ts` 6 項）。端對端新增 `e2e/garden.e2e.mjs` 4 項（實際按 E、建造選單、時間往前後開花）；build、harvest、npc、quest、save、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/garden_*.png`（已檢視：桃樂、鬆土、花圃三個階段；桃樂原本和米菈一樣戴帽子，已拿掉）。

### 完整 e2e（2026-10-15，任務 7J 之後）
- `pnpm e2e` 36 個 suite 連跑：35 個全過；`dev` 1 項失敗（「新遊戲」後立刻讀位置得到 (0, 0)：固定等 400 ms，整組連跑、機器忙時不夠）。單獨重跑 2 次都通過；改為等到位置回到出生點再比對，重跑通過。

### 任務 7J：製作——琳娜的草藥桌（2026-10-15，Bible §26.1–26.2）
- 製作系統（T-152）：工作台與配方資料、指令 `Craft`、工作台畫面 `ui/CraftPanel.tsx`（配方、材料持有 / 需要、還缺多少、製作按鈕），和琳娜對話選「借用草藥桌」開啟、Esc 關閉。配方：小瓶草藥水、月露藥膏（琳娜的任務完成後）。除錯 API `openCraft(id)`；截圖 `craft_herbtable.png`（`--shop` 一起拍）。
- 測試：Vitest 715 項（新增 `craft.test.ts` 5 項）。端對端新增 `e2e/craft.e2e.mjs` 4 項；forestquest、letters、npc、dev 重跑全過；未跑完整 e2e。

### 任務 7I：使用消耗品（2026-10-15，Bible §25.3）
- 小瓶草藥水回復 35、月露藥膏回復 50 並解除緩速（T-151）：背包的「使用」按鈕、快速鍵 X（自動選藥）、HUD 回復藥數量。體力滿時不浪費藥。指令 `UseItem`、事件 `PlayerSlowCured`、除錯指令 `DebugSetHp`、除錯 API `slowPlayer`。
- 修正：背包的「消耗品」分類顯示成 key；新增 i18n 測試。
- 測試：Vitest 710 項（新增 `consumables.test.ts` 3 項、使用規則 2 項、i18n 1 項）。端對端新增 `e2e/potion.e2e.mjs` 4 項；combat、melee、magic、forestmobs、harvest、settings、gamepad、dev 重跑全過；未跑完整 e2e。

### 任務 7H：米菈的雜貨補給（種籽幣商店，2026-10-15，Bible §26.3）
- 商店（T-150）：和米菈對話選「看看補給品」開店（`ui/ShopPanel.tsx`：購買 / 出售分頁、種籽幣餘額、數量增減、價格與持有數、錢或數量不夠時按鈕停用），Esc 關閉、開著時角色不動。買賣是權威指令 `BuyItem` / `SellItem`；任務物品與貨幣不能買賣；庫存依任務進度解鎖。付錢的提示改為「付出 種籽幣 ×N」。除錯 API `openShop(id)`；截圖旗標 `--shop`。
- 測試：Vitest 704 項（新增 `shop.test.ts` 6 項：資料規則、解鎖、對話入口、買與各種拒絕、背包滿時不扣幣、賣）。端對端新增 `e2e/shop.e2e.mjs` 4 項；npc（村長的選項變 4 個）、quest、lighthouse、puffking、letters、forestquest、forestguard、tavern、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/shop_*.png`（已檢視）。

### 任務 7G：郵差尼可與「郵袋裡的三封信」（2026-10-15，Bible §21.1、§22.1）
- 尼可（`niko`）：木橋修好後出現在村子東邊（初遇對話含芽芽的插話）。`quest_dawn_004`（角色故事）：接取拿到給米菈、波木、琳娜的三封信 → 撿兩籃乾布 → 依任意順序送信（每位收信人「第一封」與「之後」兩種回應；米菈說出 Bible 台詞）→ 回報尼可（依第一封換三種感謝語，說出 Bible 台詞）→ 空白明信片 × 3、種籽幣 × 30。
- 系統（T-149）：任務目標 `talk`、對話效果 `questTalk` / 指令 `QuestTalk`、條件 `questTalkDone` / `questTalkCount` / `questTalkFirst`、任務 `start.items`、物品分類 `currency`；世界地圖在還沒送信的收信人身上標記。新物品與圖示：三封信、乾布、空白明信片、種籽幣；新程式模型乾布籃。placement 附加 2 個。截圖旗標 `--letters`。
- 測試：Vitest 698 項（新增 `letters.test.ts` 6 項：尼可出現條件、接取拿信、乾布限定任務、送信順序與第一封回應、三種回報感謝語與獎勵、地圖標記與存讀檔）。端對端新增 `e2e/letters.e2e.mjs` 5 項（實際按 E 與對話選項走完、進螢苔祕林送信、任務日誌分類）；npc、quest、lake、harvest、forestquest、lighthouse、journal、companion、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/letters_*.png`（已檢視：尼可、乾布籃；`--npc` 那張尼可被樹擋住且木橋修好前不出現，以 `--letters` 為準）。

### 任務 7F：任務日誌（2026-10-15，Bible §31.2–31.3）
- 任務日誌（`ui/QuestJournal.tsx`，J 開關、Esc 關閉、暫停選單也能開；開著時角色不動）：進行中 / 可接取 / 已完成三個分頁，依主線、支線等分類分組；每個任務顯示發起人與所在地圖、說明、目標進度、可回報對象、已知獎勵（物品圖示、哪一區的霧散去）、地圖標記（「在地圖上查看」直接開世界地圖）。新動作 `journal`（可重新配置），操作提示加上「J 任務」。
- 追蹤（T-148）：新指令 `TrackQuest` / 事件 `QuestTracked`，任務分類 `category`（現有任務都是主線）；主線一定顯示，其他任務最多追蹤 3 個，追蹤列只顯示追蹤中的任務。存檔的任務紀錄新增選填欄位 `untracked`（不升版本）。
- 測試：Vitest 691 項（新增追蹤規則 3 項：預設追蹤、取消與再追蹤、上限與滿了時新接的不追蹤）。端對端新增 `e2e/journal.e2e.mjs` 5 項；settings、quest、npc、map、gamepad、tutorial、save、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/journal_*.png`（`node scripts/screenshot.mjs phase7 highland --journal`，已檢視）。

### 任務 7E：霧團噗啾王（2026-10-15，Bible §5.5）
- 頭目框架一般化（T-145）：招式 / 水槽 / 護盾 / 縮殼 / 入口改為選填，新增衝撞（`charge`）、彈出霧球（`orbs`）、暈眩（`stun`）、每個頭目自己的文字前綴；苔咚的資料與行為不變（bossAi、bossFight、boss、forestguard 測試全過）。
- 霧團噗啾王（T-146）：程式造型（灰紫半透明果凍、額頭不穩定的金色光點、軟軟的小角，生氣時膨脹、蓄力時轉亮紫），燈塔東邊的平地上、燈塔點亮後開戰；衝撞（地上的路線）、霧球（落點圈與拋物線）、膨脹震地（落點圈），都蓄力 0.8 秒。蓄力時在戰場西側的星光鏡（新程式模型）按 E，燈塔的光照過去讓牠暈眩 3 秒（頭上轉圈的星星、沿線的金色光點）。第二階段霧球變多、冷卻變短。擊敗後縮成小噗啾、恢復淡紫色淡出，掉落星光碎屑、霧凝膠、低機率噗啾軟角裝飾（新物品與圖示）。
- 戰後（T-147）：小噗啾 NPC 出現在晨曦村東北的草原（泡泡音、蹭手），米菈說牠只是生病了；芽芽在燈塔點亮後提示去看看牠。
- placement：附加星光鏡 1 個、移除戰場內散佈的樹石 14 個，其餘不變。截圖旗標 `--puffking`。修正：轉動任何 `turn` 機關都會跳出「分水木輪轉向了另一道木槽」，改為只有木輪。
- 測試：Vitest 688 項（新增 `puffKing.test.ts` 10 項：戰場平坦與沒有碰撞物、衝撞只撞一次 / 閃得開、霧球落點與第二階段、只有蓄力時能暈眩、不會縮殼、燈塔點亮才開戰、沒有護盾與暈眩加傷、招式傷害與掉落、戰後的小噗啾與米菈）。端對端新增 `e2e/puffking.e2e.mjs` 5 項（開戰條件、HUD 與提示、星光鏡時機與暈眩、衝撞打中、擊敗後小噗啾與米菈）；boss、forestguard、combat、forestmobs、lighthouse、npc、dev 重跑全過；未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/puffking_*.png`（`node scripts/screenshot.mjs phase7 highland --puffking`，已檢視：開場、HUD、三種預兆、暈眩、倒下、村外的小噗啾；第一版額頭光點與小角埋在身體裡，已移出來）。效能：截圖時 120 fps、draw calls 407–487；未跑 `perf.mjs`。

### 任務 7D：燈塔的最後一盞光（2026-10-15，Bible §5.4 `quest_dawn_003`、§5.3、§5.6）
- 新任務 `quest_dawn_003`：林緣的霧散去（雷歐的 `clear_forest`）後由米菈交付（接取、進行中、回報、完成後四段對話）。目標依序（T-141、T-142）：趕走迷霧噗啾 × 3（燈塔旁新增生成點）→ 淨化燈塔旁的迷霧核心 → 把三片燈罩碎片裝回塔頂點亮燈塔。燈罩碎片是任務唯一、不重生的固定拾取物（登山客營地、高地西邊的廢屋、燈塔後面），只在任務中能撿。順序不對時提示「還不是時候」。
- 燈塔（T-143）：塔頂加上程式模型的燈籠室（熄滅：空燈架與破燈罩；點亮：完整燈罩與金色燈芯），點亮後兩道金色光柱慢慢旋轉（白天淡、夜晚亮，`LighthouseBeam`），點亮瞬間金光從塔頂擴散兩圈、芽芽說話。迷霧核心（灰紫晶簇與霧團 → 淡金白小晶簇與新草）。
- 獎勵：晨之共鳴（主線關鍵物品）、晨光護符、星光碎屑 × 3、晨風高地的霧散去。往螢苔祕林的林道入口改為燈塔任務完成後才開（T-144，Bible §3.1），未完成時說明原因。
- 新物品圖示：燈罩碎片、晨之共鳴、晨光護符。placement 附加 5 個（移除重疊的散佈石頭 1 個），其餘不變。除錯 API `lighthouseBeam()`；截圖旗標 `--lighthouse`。
- 測試：Vitest 677 項（新增 `lighthouse.test.ts` 10 項：資料與位置、林道入口條件、接取前撿不到 / 碰不到、碎片不重生、依序規則、缺碎片、回報與存讀檔、地圖標記；`maps.test.ts` 林道入口條件改為燈塔）。端對端新增 `e2e/lighthouse.e2e.mjs` 7 項（實際按 E 與對話選項走完、入口在點燈前後的行為）；glowmoss、npc、quest、harvest、world、combat、monsters、dev 重跑全過。上一個任務（8D-2）收尾時的完整 `pnpm e2e` 29 個 suite 連跑全過；本任務未跑完整 e2e。
- 截圖 `docs/screenshots/phase7/lighthouse_*.png`（`node scripts/screenshot.mjs phase7 highland --lighthouse`，已檢視：碎片、迷霧核心淨化前後、熄滅 / 點亮 / 夜晚的燈塔、點亮瞬間）。光柱在夜晚第一版太亮（攝影機在光柱內時整個畫面變白），改為側面才看得清楚、亮度降低；最終亮度請試玩時確認。效能：截圖時 FPS 面板 120 fps、draw calls 395–468；未跑 `perf.mjs`。

### 任務 8D-2：苔冠下的守衛（2026-10-14，Bible §6.4、§6.5）
- `quest_forest_003`「苔冠下的守衛」：水道任務完成後由奇奇交付（接取、進行中、回報、完成後四段對話，回報時說出 Bible 的戰後台詞），目標「讓苔咚停止攻擊」（新目標類型 `boss`，以已擊敗的頭目判斷）→「啟動菌樹後面的森林根源石」。苔咚的開戰條件改為這個任務進行中（`requires.questActive`，T-136）。
- 森林根源石（`prop_forest_root_stone`，程式模型：被樹根環抱的圓頂石、正面刻著嫩芽；沉睡時灰暗、甦醒後刻紋發出螢光薄荷色、周圍冒出新芽與光點）：苔咚平靜下來前按 E 會被擋下（`afterBoss`，T-137）；啟動時取得主線關鍵物品芽之共鳴（固定發放），綠光從石頭擴散、芽芽說話。
- 戰後的苔咚（T-138）：縮成普通尺寸、守在菌樹下的 NPC（有出現條件的程式造型 NPC，新條件 `bossDefeated`），待機時呼吸搖擺、說話時開心地小跳，對話是泡泡音與動作；根源石還沒醒時示意石頭，之後說出「咚……芽……水……回來了。」
- 回報：苔蘚披肩布料（新物品，外觀材料）、星光碎屑 × 3、苔冠空地的霧散去、根鬚迷宮變淡、斷流小渠南端堵住林間水道的樹根退開，地圖出現「林間水道（往澄鏡湖）」地標與路標（地圖三尚未開放，T-139）。芽芽的 H 提示分成戰前、戰後、可回報三段。
- 修正（T-140）：小地圖 / 世界地圖沒有畫出螢苔祕林的 NPC 與他們的任務標記（「!」「?」），改為在任一張地圖範圍內就畫。
- 新物品圖示：芽之共鳴、苔蘚披肩布料（SVG）。placement 附加 3 個（根源石、林間水道的樹根與路標），其餘不變。截圖旗標 `--guardian`。
- 測試：Vitest 664 項（新增 `forestGuard.test.ts` 9 項：任務資料與位置、接任務才開戰、戰前碰不到根源石與苔咚不在、戰後的苔咚與對話、啟動根源石取得芽之共鳴、回報獎勵與水道樹根與地標、舊存檔接任務前就打倒的苔咚、世界地圖標記、存讀檔；`bossFight.test.ts` 開戰條件改為守衛任務進行中）。端對端新增 `e2e/forestguard.e2e.mjs` 6 項（實際按 E 與對話選項：接任務、根源石被擋、打倒後與苔咚對話並播放泡泡音、啟動根源石、回報、戰後短語與存檔）；boss、forestquest、npc、quest、map、companion、audio、dev 重跑全過。E2E_FULL_RESULT
- 截圖 `docs/screenshots/phase8/guardian_*.png`（`node scripts/screenshot.mjs phase8 glowmoss_crown --guardian`，已檢視：林間水道的樹根與路標、沉睡 / 甦醒（白天、夜晚）的根源石、芽之共鳴的綠光、戰後的苔咚、回報後退開的樹根）。截圖時 FPS 面板 120 fps、draw calls 258–331；未跑 `perf.mjs`。

### 任務 8D-1：頭目苔咚，苔冠守衛的戰鬥（2026-10-14，Bible §6.5、§27.4）
- 頭目框架（T-131）：敵人資料 `boss`、`manual` 生成點、指令 `StartBossFight` / `EndBossFight`、`EnemyStrike.move`、事件 `BossDefeated`，存檔 v14（`combat.defeatedBosses`）；純函式 AI `game-core/combat/bossAi.ts`；本機端 `game/combat/bossRuntime.ts`（走進戰場開戰、離開結束、招式命中、HUD 與提示）。
- 苔咚（T-132）：程式造型（奶油色菌傘、深綠苔甲、四隻根腳、背上的發光小花，迷霧期傘緣灰紫色、身邊飄著迷霧）`world/entities/enemy/MossThump.tsx`；開場從菌樹下鑽出、追擊（繞過樹幹、不離開空地）、根刺 / 跳躍震地 / 睡眠孢子都有地面預兆、縮入菌傘、震地後頭昏眼花的破綻、50% 以下第二階段。
- 戰場機制：空地邊緣三個水槽（prefab `crown_trough`，乾涸 / 注滿兩種程式模型，placement 附加 3 個，其餘不變），戰鬥中按 E 引水，每注一個迷霧退一層（傷害倍率 0.15 → 0.4 → 0.7 → 1），沒注滿前打不倒。入口樹根牆（`world/boss/BossArena.tsx`）、頭目血條與水槽指示（`ui/BossBar.tsx`）。倒下後在入口外重來、水槽保留；離開空地結束戰鬥（T-133）。
- 擊敗：固定掉落苔冠菌帽（新物品 `moss_cap`，圖示 SVG）、星光碎屑 4–5、螢光花粉 2–3；苔咚縮小淡出，不再開戰。開戰條件暫為水道任務完成；任務、根源石、芽之共鳴、戰後的苔咚 NPC 在 8D-2（T-135）。
- 修正（T-134）：權威層在指令沒有產生事件時不再通知訂閱者（原本會被當成讀檔，重設頭目 HUD、緩速、施法與夥伴位置）。
- 測試：Vitest 652 項（新增 `bossAi.test.ts` 8 項：開場、根刺標記與躲避、第二階段、震地落點與破綻、孢子扇形、縮入菌傘、不離開戰場與繞過樹幹、玩家倒下時不出招；`bossFight.test.ts` 10 項：資料位置、開戰條件、水槽只在戰鬥中、護盾倍率與血量下限、姿態倍率、招式傷害與孢子緩速、倒下重試、離開戰場、擊敗與掉落、存讀檔；v13 → v14 遷移；權威層不通知空事件）。端對端新增 `e2e/boss.e2e.mjs` 8 項（開戰條件、HUD、入口走不出去、按 E 注水、根刺打中 / 震地躲開、孢子緩速、倒下重來、擊敗後入口打開與存檔），combat 9、melee 13、magic 11、forestmobs 5、monsters 5、companion 6、save 12、forestquest 12 重跑全過；未跑完整 `pnpm e2e`。
- 截圖 `docs/screenshots/phase8/boss_*.png`（`node scripts/screenshot.mjs phase8 --boss`，已檢視：開場、HUD、入口樹根、三種預兆與出招、破綻的星星、縮入菌傘、注滿的水槽、迷霧退去後的傘緣、擊敗的掉落）。效能：截圖時 FPS 面板 120 fps、draw calls 325–356（空地內）；未跑 `perf.mjs`。

### 移動掉幀修正、除錯面板書籤名稱、上線計劃（2026-10-14）
- 使用者回報移動時 FPS 從 80–90 瞬間掉到 40–60。量測（前景 Electron，跑 16 秒、CPU profile、記錄新編譯的 program 與觸發的物件）：長幀 117–266 ms 全部是 shader 第一次編譯（`getProgramInfoLog`）：遠處區塊、陰影深度材質、靠近才生成的怪物（風絮團、飛蛾、迷霧芽怪等）。修正：載入時預熱（T-129，`ShaderWarmup`、`EnemyShaderWarmup`）。修正後連跑 3 次：移動中最長幀約 25 ms、移動中沒有新編譯的 program，平均 8.3 ms。主選單後第一次按鍵建立 AudioContext 的一次性長幀不在此列（正常遊玩發生在主選單）。
- 第二輪（使用者要求以跑步與跳躍測試）：沿路點衝刺加跳躍繞晨曦谷地一圈約 2 分鐘，移動中 > 25 ms 的幀 104 次、越跑越長（33 → 142 ms）。原因是小地圖 / 世界地圖的霧罩每進一格探索格就整張重畫，且每個已探索格各做一次模糊（T-130）；另外預熱用的怪物材質卸載時 dispose，把預熱好的 program 一起刪掉了（T-129 補充）。修正後同一路線只剩 1 次（42 ms）、平均 8.3 ms；原地跳、只跑不跳都沒有長幀（`PERF.md`）。
- 除錯面板（只在開發版或 `?debug`）：補上 18 個攝影機書籤的顯示名稱（原本顯示 `bookmark.xxx`），新增 `src/data/i18n/i18n.test.ts` 檢查每個書籤都有名稱；書籤清單改為預設收合，不再蓋住小地圖與技能列。
- 新增 `docs/LAUNCH_PLAN.md`：網頁版（Vercel）、Supabase（帳號、雲端存檔）、多人（先 Supabase Realtime，再 Cloudflare Durable Objects 跑 game-core 權威層）、桌面發行與費用；待使用者決定多人玩法與是否商業化（§11）。
- 驗證：`pnpm check`（Vitest 631 項）、`pnpm build` 通過；e2e monsters 5、forestmobs 5、combat 9、world 11、region 8、dev 全過；第二輪後 map 9、monsters 5、forestmobs 5 重跑全過，截圖 `phase8/map_world_*.png`（霧罩挖空與模糊邊緣正常）；截圖 `docs/screenshots/phase8/follow.png`、`meadow.png`（已檢視：沒有被預熱打開後殘留的物件、除錯面板收合）。效能：以自寫量測腳本（不在 repo）量測移動中的幀時間，未跑 `perf.mjs`；未跑完整 `pnpm e2e`。

### 任務 8C：琳娜 / 奇奇與水道謎題（2026-10-14，Bible §4.5、§4.6、§6.4）
- 規格來源：拆分與排程在本檔與 `GAME_DESIGN.md` §2.2，內容依 Bible §6.4（決策 T-123）。
- 琳娜（林緣小徑）`quest_forest_001`「不會發光的路」：螢苔 × 5、月露草 × 3、點亮林緣小徑的三盞路燈 → 月露藥膏 × 2、星光碎屑、林緣小徑的霧散去。奇奇（渠道邊的路牌旁）`quest_forest_002`「把水還給森林」：移開堵住上游的樹根（得到根纖維 × 2）→ 打開兩座古水渠閘門 → 修補崩塌的渠段（石頭 × 4、根纖維 × 2）→ 水流到分水木輪，轉動木輪把水沿三道木槽引到三塊苔蘚 → 小瓶草藥水 × 2、星光碎屑 × 2、螢苔林地的霧散去、苔冠空地入口的樹根退開。兩人各有接取前、進行中、回報、完成後的對話（含 Bible 台詞），芽芽的 H 提示也加上兩個任務。
- 機關（T-124）：prefab `activate`（路燈、樹根、閘門、苔蘚節點、苔冠入口樹根）與 `turn`（分水木輪），指令 `ActivateObject`、`TurnObject`，任務目標 `activate`、任務獎勵 `objects`；存檔 v13（`active`、`turn`）。
- 水道謎題（T-125）：`data/waterways.json` ＋ `game-core/world/waterway.ts` 純函式；權威層在機關改變後重新計算水流，水流到的苔蘚節點自動醒來。畫面（T-126）：渠道的流動水面從泉眼推進到第一個沒排除的阻擋點，修通後流到底；汲水輪轉動、分水盆轉向、木槽有水、苔蘚醒來時光點上升。苔冠空地西側開口在完成前以樹根封住並可閱讀原因（T-127）。
- Bible 的配方與製作尚未實作，獎勵直接給成品，新物品分類 `consumable`（使用功能之後再做，T-128）。新物品月露藥膏、小瓶草藥水（圖示 SVG）；新程式模型：路燈（亮 / 暗）、打開的閘門、崩塌 / 修好的渠段、汲水輪骨架 / 輪 / 分水盆 / 操作桿、乾枯 / 甦醒的苔蘚節點。placement 附加 9 個（移除重疊的散佈點綴 8 個，其餘 id 與位置不變）。攝影機書籤 `glowmoss_wheel`、`glowmoss_crown_gate`、`glowmoss_lanterns`；截圖旗標 `--waterway`；除錯 API `waterway()`、`questObjectives(id)`。
- 測試：Vitest 630 項（新增 `waterway.test.ts`：水流依序、木輪指向、要喚醒的節點、資料驗證、渠道沿線距離；`forestQuests.test.ts`：以實際資料走完兩個任務、接取前不能動機關、先開下游閘門不算、缺材料、修好瞬間喚醒第一塊、轉回醒過的節點不重複、獎勵與樹根退開、存讀檔、地圖標記、苔冠入口的樹根蓋住整個開口；v12 → v13 遷移）。端對端新增 `e2e/forestquest.e2e.mjs` 12 項（實際按 E 與對話選項走完兩個任務、水面推進、汲水輪轉動、分水盆轉向、入口走不進去 / 回報後走得進去）。完整 e2e（27 個 suite 逐一單獨執行，2026-10-14）：26 個全過，`glowmoss` 1 項失敗（存檔版本寫死 12，升到 v13 後不符）→ 改為讀 `SAVE_VERSION`，重跑全過；`Waterway.tsx` 小整理後重新 build，`forestquest` 連跑 2 次全過。效能：未跑 `perf.mjs`（截圖時 FPS 面板 draw calls 317–561，與 8A 同級）。
- 截圖 `docs/screenshots/phase8/waterway_*.png`（`node scripts/screenshot.mjs phase8 glowmoss_wheel --waterway`，已檢視：路燈白天 / 夜晚、乾涸與流水的渠道、閘門打開、木輪與木槽、苔冠入口封住與打開）。

### 任務 8B：螢苔祕林的怪物（2026-10-14，Bible §6.6）
- 霧孢飛蛾（新，程式造型）：靠近後繞著玩家盤旋再俯衝，前搖時翅膀快速閃白，出手時散出迷霧粉塵；掉落螢光花粉 65%、霧凝膠 20%。每群 2–4 隻（螢苔林地、發光石環、林緣小徑）。
- 根鬚甲蟲（新，程式造型）：被打到時縮殼減傷（× 0.25），縮完立刻反擊、短時間內不再縮殼；衝撞後暈頭轉向的破綻受到 × 1.5 傷害；掉落根纖維 70%、木材 30%（根鬚迷宮、渠道北段）。
- 迷霧芽怪（沿用 7C）：中距離吐出灰紫色泥團（拋物線、可閃避），打中扣血並讓玩家 2.5 秒變慢（提示「腳上沾滿了泥巴」）；晨曦谷地的芽怪也一樣。螢苔祕林新增 3 個生成點。
- 行為與傷害倍率是資料（T-121、T-122）；`AttackEnemy` 帶敵人姿態、`EnemyStrike` 可為泥團；除錯 API `hitEnemy(id, attack)`、`playerSlow()`；截圖腳本 `--monsters --enemies=<id,...>` 只拍指定的怪物。
- 測試：Vitest 606 項（新增 `forestMobs.test.ts`：盤旋與出手時機、出手後重新盤旋、縮殼減推與冷卻、破綻、權威層的姿態倍率、吐泥的距離與瞄準、泥團傷害與緩速、只有吐泥行為能送泥團、生成點與掉落資料）；端對端新增 `e2e/forestmobs.e2e.mjs` 5 項（三種都在螢苔祕林生成、飛蛾盤旋後前搖、甲蟲縮殼減傷、破綻加傷、芽怪泥團扣血與實際走得變慢）；combat 9、melee 13、magic 11、monsters 5 重跑全過。完整 e2e（26 個 suite 逐一單獨執行，2026-10-14）：25 個全過，forestmobs 1 項偶發（甲蟲縮殼的動作晚一幀更新，測試改為等動作），修正後連跑 2 次全過。截圖 `docs/screenshots/phase8/monster_mob_fog_moth.png`、`monster_mob_root_beetle.png`（甲蟲清楚；飛蛾那張剛好拍到翅膀側面且被區域橫幅擋住，造型請試玩時確認）。

### 任務 8A：螢苔祕林——地圖切換與場景（2026-10-14，Bible §6）
- 地圖框架（T-117）：所有地圖在同一個物理世界，螢苔祕林原點在 (2000, 0)，320 m、可玩區 ±148 m。`game-core/world/maps.ts`（地圖定義、`mapIdAt`、各地圖邊界與重生點）、`glowmossTerrain.ts`（地形）；`terrainHeight` / `distanceToPath` 依座標分派。地形碰撞、邊界牆、取樣格、草地、霧牆每張地圖各一份，畫面只顯示所在地圖（`MapOnly`），遠景跟著地圖移動。
- 出入口（T-118）：晨曦谷地溪東荒野道路盡頭的「林道入口」⇄ 螢苔祕林林緣小徑西端。修好木橋（`repair_bridge`）前會說明原因、不能通過（燈塔尚未實作，完成後再加上）。黑幕轉場，抵達時安全點換成新地圖；掉落與倒下回到所在地圖。芽芽會一起傳送。
- 區域與存檔（T-119）：林緣小徑、螢苔林地（預設）、根鬚迷宮、苔冠空地；存檔 v12（新區域迷霧、探索紀錄延長）。進入新地圖時區域橫幅加上地圖名稱；小地圖與世界地圖顯示所在地圖（世界地圖標題改為「世界地圖」＋地圖名），7 個新地標。
- 場景（T-120）：林間小徑網、乾涸的斷流小渠（兩座古水渠閘門、堵住渠道的樹根、北邊泉眼）、月牙樹、發光石環、苔冠空地與巨大蘑菇樹（山脊只留西側開口）、根鬚迷宮（5 × 5 格、35 面樹根牆、最深處寶箱）、4 座樹根拱門；約 2300 個 placement（Kenney 暗色樹 6 種可砍、蕨類、蘑菇、石頭、倒木，程式模型的發光苔蘚、發光蘑菇、可採集的螢苔與月露草），邊界兩排大樹。樹冠下的青綠色調與較近的霧（`tintTimeLookForMap`），林地飄著螢光孢子。新物品螢苔、月露草。
- 新增 Kenney Nature Kit 15 個（CC0，`ASSETS.md`）；攝影機書籤 `glowmoss_entry / glade / ring / crown / maze / channel / overview`、`dawn_gate`。除錯 API `currentMap()`、`travelToMap(map)`、`setQuestCompleted(id)`、`mapExplored(map?)`。
- 測試：Vitest 596 項（新增 `maps.test.ts`：地圖判斷、地形分派、邊界、取樣格、區域、平台與山脊、沒有可落水處、小徑坡度、探索分段與舊紀錄補空白、出入口抵達點與條件、placement 區域一致；v11 → v12 遷移）；端對端新增 `e2e/glowmoss.e2e.mjs` 12 項（鎖住時的說明、轉場、抵達位置與著地、地圖與區域名稱、小地圖、走動、苔冠空地濃霧、邊界、掉落回到新地圖、採集螢苔、v12 存檔、讀檔回到螢苔祕林、回到晨曦谷地）。截圖 `docs/screenshots/phase8/`（已檢視：無粉紅材質、模型都載入、渠道泥面只在渠內）。
- 完整 `pnpm e2e`（2026-10-14）：連跑到 magic 為止 199 項通過、1 項失敗（`magic.e2e`「F 星屑飛彈」命中 0 發），因 `&&` 中斷，之後的 map / monsters / glowmoss / dev 未跑；magic 單獨重跑 2 次都全過，map 9、monsters 5、glowmoss 12、dev 9 單獨跑全過。判斷為已知的連跑記憶體壓力（見「已知問題」）。
- 效能：未跑 `perf.mjs`（需要無人操作的機器）。截圖時的 FPS 面板：螢苔祕林 draw calls 289–496、三角面 54–70 萬，與晨曦谷地同級（A 級預算 draw calls ≤ 400，部分視角超過，晨曦谷地本來就是 358–530）；需要時以 cullDistance 或合併樹木再壓低（「待使用者處理」第 0 項一併量測）。

### Phase 7 效能（2026-10-14）
- 地圖擴大與怪物加入後 draw calls 941–1330、冷啟動 9.0 s；優化後 draw calls 358–530、冷啟動 3.6 s（怪物遠處隱藏、點綴的距離剔除與不投影、模型部件合併、草花延後建立、地形法線直接計算；T-116，`PERF.md`）。畫面經截圖確認不變。
- 量測時電腦有其他程式在執行，每幀時間偏慢，需在空閒時重測（「待使用者處理」第 0 項）。

### 任務 7C：多樣的怪物（2026-10-14）
- 12 種新怪物（Quaternius Ultimate Monsters，CC0，骨架動畫）：迷霧芽怪、霧凝史萊姆（霧林深處）、風絮團（西坊農田、南方草原）、水泡精、沼澤蛙（碎光溪）、暮影蝙蝠、岩芽石偶、雪球怪（晨風高地）、荊棘噗啾、霧魂、蘑菇王（古樹遺跡，頭目級）、角角龍（溪東荒野，衝撞）；加上原本的迷霧噗啾（霧林邊緣、望星丘），共 13 種、16 個生成點（T-113–T-115）。
- 模型怪物依 AI 狀態播放待機 / 移動 / 攻擊 / 受擊 / 倒下動畫，被打閃白，攻擊前搖時轉紅，倒下後淡出；各有掉落表，新物品「霧凝膠」（圖示 SVG）。
- 小地圖上附近的怪物顯示為紅點（7B）。
- `combat / melee / magic.e2e` 改為只看霧林邊緣生成點的迷霧噗啾（地圖其他地方也有怪物了）。
- 測試：Vitest 新增怪物資料（≥ 10 種、各有生成點、迷霧生物在晴朗時不出現）、衝撞 AI、每個怪物模型與動畫片段 / 換色材質存在；端對端新增 `e2e/monsters.e2e.mjs` 5 項（12 種都會生成並播放動畫、受擊與倒地動畫、蘑菇王掉落、迷霧清除後霧魂消散而野生怪物留下、非和平模式會追擊攻擊）。截圖 `docs/screenshots/phase7/monster_*.png`、`monster_contact_sheet.png`、`monster_chase.png`（`--monsters`）。

### 任務 7B：世界地圖與小地圖（2026-10-14，Bible §31.3）
- 小地圖（右上角圓形、北方朝上、半徑 44 m）：地形底圖、未探索霧罩、地標、寶箱、村民、附近敵人、任務標記（範圍外夾在邊緣）、玩家箭頭與視野扇形，下方顯示目前區域。室內與對話時隱藏。
- 世界地圖（M，可重新配置；暫停選單「世界地圖」）：整張晨曦谷地、探索比例、區域名稱、15 個地標（`data/landmarks.json`）、任務標記（可接「!」、可回報「?」、目標★與區域圈）、寶箱、村民、玩家；滾輪縮放、拖曳平移、圖例；開啟時角色不能移動，Esc 只關地圖（T-110–T-112）。
- 探索紀錄：8 m 一格，走過的地方揭開半徑 26 m，權威狀態（`ExploreArea` 指令、`AreaExplored` 事件），存檔 v11。除錯 API `revealMap / mapExplored / isExplored / setMapOpen / questMarkers`。
- 測試：Vitest 新增探索格子與編碼、規則、v10 → v11 遷移與讀寫、任務標記與地標資料；端對端新增 `e2e/map.e2e.mjs` 9 項（含存檔重開）。截圖 `docs/screenshots/phase7/map_*.png`（`--map`）。

### 任務 7A：晨曦谷地擴大到 320 m（2026-10-14，Bible §5.2）
- 地形 160 → 320 m、可玩區 ±148 m（座標 -Z 為北）：北方晨風高地（10 m 懸崖，主路是緩坡）、東側碎光溪（溪床 -3 m，兩處可涉水的淺灘與踏腳石、一座溪橋）、西坊農田、西南望星丘（15 m）、東南古樹遺跡、燈塔平台與外圍丘陵；道路網為主路＋六條支線（T-103）。中央舊內容座標不變，舊散佈的 id 與位置不變，只移除落在新道路上的 18 個（T-104）。
- 新區域 `highland`、`farmland`、`river`（帶狀範圍，T-105），`overlook`、`ruins` 補上範圍；存檔 v10。
- 場景內容：placement 約 320 → 2645 個。西坊農田（三戶農家、藍風車、攤位、井、柵欄圍起的玉米田、南瓜 / 西瓜 / 紅蘿蔔田、麥田）、晨曦燈塔（暫用 KayKit 塔）與高地營地、廢屋、懸崖腳的岩柱；溪橋、水車、獨木舟、睡蓮；古樹遺跡（巨樹、一圈石柱、石環入口、方尖碑、倒下的石像、寶箱）；望星丘頂的長椅、燈、旗與隱藏寶箱；南方旅人營地；村莊外圍的波木木工坊、鐵匠鋪、大橡樹、倒下的大樹與隱藏寶箱 `chest_dawn_hidden_01`（Bible §5.8）；各生態區散佈（高地針葉林、霧林深處、西邊橡樹林、南邊秋色樹、東邊荒野、灌木、草叢、小花、蘑菇、岩石、可採集的花草與石頭）；新邊界兩排裝飾樹。6 個新路標可閱讀。
- 素材：Kenney Nature Kit（72 個，CC0）＋ KayKit Hexagon 追加 26 個（CC0），登記於 `ASSETS.md`；Kenney 材質依名稱換成專案色票（T-109）。
- 渲染：水面改為湖與溪共用、以水深貼圖著色（T-106）；世界物件依 64 m 分塊渲染以便剔除（T-107）；地形取樣共用一份（T-108）；遠山與地面延伸放大。
- 攝影機書籤新增 highland、farmland、river、ruins、stargaze、south、valley（俯瞰）。
- 測試：Vitest 508 項（新增溪流 / 淺灘 / 橋頭高度、高地主路坡度、只有湖與溪低於水面、道路網、取樣格一致、分塊、v9 → v10 遷移；邊界測試改為相對尺寸）；端對端 `bounds.e2e` 改為 ±148 與西北角，`movement.e2e` 的邊界與掉落測試改在溪東岸、攝影機陡坡測試改用高地懸崖。截圖 `docs/screenshots/phase7/`（全部書籤）。

### 任務 6F：名稱與設定對齊 World Bible v2（2026-10-13）
- 顯示名稱改用 Bible（決策 G-01、G-03：存檔中的 ID 都不變）：米拉長老 → 村長米菈、巴魯 → 木匠波木、露米 → 芽芽、星光村 → 晨曦村、鏡湖 → 晨露湖、迷霧森林 → 霧林邊緣、星光碎片 → 星光碎屑、花朵 → 野花、迷霧生物 → 迷霧噗啾；任務名稱改為「一座橋的距離：木材 / 修好木橋」（Bible `quest_dawn_002`）與「驅散林緣的迷霧」。共 48 條文字（含路標、告示板、提示、教學）。
- 台詞換成 Bible 的版本：米菈的初遇（「歡迎來到晨曦村……實在稱不上歡迎」）與委託、波木的「好消息：橋還能修」與「耐心我有很多」、修好橋與小島建造的話、芽芽的初遇（「你也聽得到星星的聲音嗎？」）；森林清除後米菈說出「也許有些生物只是生病了」，呼應魔法的淨化。
- 雷歐與茉莉保留為晨曦村配角，角色設定寫在 `GAME_DESIGN.md` §2.3。NPC 仍用 KayKit 人形模型，Bible 的兔族、熊族外型列入 Phase 7。
- 端對端測試中依名稱比對的斷言一併更新（11 個檔案）。

### 任務 6E：流星雨與魔法打磨（2026-10-13）
- 流星雨（C，60 星光、30 秒冷卻，T-102）：0.8 秒蓄力時前方 7 m 的地面出現大型落點魔法陣（預警）；發動後 7 顆火光流星依序從天空斜落、帶拖尾，每顆撞擊有衝擊波、火花與光塵，最後一顆落在中心、範圍最大，附光閃與鏡頭震動；每顆以範圍判定命中（30 傷害）。施法動作 Spellcast_Raise → Spellcast_Long。
- 手把：RB 星光衝擊、十字下 星屑飛彈、R3 流星雨；HUD 多一格流星雨冷卻；操作說明加上流星雨。
- 打磨：星屑飛彈核心顏色不再過曝成白色；除錯 API `resetSpellCooldowns()`；`perf.mjs --magic` 加入流星雨（最壞情況：清除冷卻連續施放）。
- 測試：Vitest 372 項（流星雨落點與時間、按鍵對應）；`magic.e2e` 增為 12 項（流星雨的落點預警、扣星光、命中、冷卻；星光不足不施放）。截圖 `magic_{day,night}_meteor_*.png`。
- 效能：量測時偵測到有人在使用電腦，數字比稍早慢約 1.6 倍（含沒有點光源的低畫質），同次比較施法只增加 0.1–1.7 ms；**待無人操作時重測**（見 `PERF.md`）。

### 任務 6D：魔法核心與 VFX 引擎（2026-10-13）
- 星光值（MP）：上限 100、每秒回 6，權威狀態、存檔 v9（`combat.mp`）；HUD 左下金色星光條（T-100）。
- 法術（`data/spells.json`、`game-core/combat/spells.ts`）：Q 星光衝擊（25 星光、6 秒冷卻；0.35 秒魔法陣蓄力 → 衝擊波、星點螺旋上升、地面火花、點光源光閃，範圍 3.6 m、40 傷害）、F 星屑飛彈（15 星光、1.2 秒冷卻；3 枚追蹤彈飛向前方 90° 內最近的敵人，藍白拖尾，命中爆星花，每發 14）。星光不足時提示「星光不足」。施法時右手換成魔杖。被魔法擊敗的迷霧生物散成金色光點（淨化）。
- VFX 引擎（`render/vfx/`、`world/vfx/VfxSystem.tsx`、`game/vfx/vfxQueue.ts`，T-101）：GPU 粒子池（一個 draw call，容量依畫質 800 / 2000 / 3000）、程式產生的魔法陣與衝擊波 shader、點光源池（中高畫質 2 盞）；所有特效 shader 在載入時預先編譯。
- 移除舊的 `skill` 攻擊與 `SkillBurst` 特效；`AttackEnemy` 接受法術 id。操作說明列改為可換行、避開左右兩側的 HUD。
- 效能：施法只增加約 0.3 ms、draw calls 最多 +6，見 `PERF.md`。
- 測試：Vitest 361 項（法術資料、星光回復、追蹤目標與轉向、扇形發射、範圍、施放扣星光 / 不足 / 倒下、法術傷害、除錯設定星光、v8 → v9 遷移、角色 GLB 含施法動畫、魔杖節點）；端對端新增 `e2e/magic.e2e.mjs` 9 項（蓄力 → 發動、扣星光與冷卻、範圍傷害、魔杖、衝擊波與光閃、追蹤彈命中、星光不足、回復、連續施放後粒子與 geometry 不增長、存檔）。截圖 `docs/screenshots/phase6/magic_*.png`（`--magic`，白天與夜晚）。`scripts/perf.mjs --magic` 量測施法負擔。

### 任務 6C：近戰：拳、踢、刀、劍（2026-10-13）
- 三種武器（`data/weapons.json`、`game-core/combat/weapons.ts`，T-97）：徒手（直拳 → 勾拳 → 迴旋踢、重擊飛踢）、短刀（雙刀：突刺 → 橫切 → 雙刃刺、重擊雙刃上撩）、單手劍（斜斬 → 橫斬 → 劈斬、重擊 360° 旋風斬）。左鍵輕擊連段（期限內接下一招）、右鍵重擊（各自冷卻）、1 / 2 / 3 切換（手把十字左），全部可重新配置。
- 動畫全部使用角色 GLB 既有片段（Unarmed / 1H / Dualwield / 2H）；武器模型：玩家原本隱藏的雙刀、從 Knight.glb 複製的單手劍掛到右手（T-98）；切換時武器從小放大出現。
- 打擊感（T-99）：出招往前衝、輕度鎖定前方敵人、命中停頓、鏡頭震動（設定可關）、刀劍揮砍拖尾（HDR 光帶）、命中火花 / 拳腳衝擊塵、先行輸入。
- 權威層：`AttackEnemy` 改帶招式 id，只接受目前裝備武器的招式、傷害來自資料；`EquipWeapon` 指令；存檔 v8（`loadout.weapon`，v7 遷移為單手劍）。
- HUD：右下三把武器的選擇列（目前武器亮起、按鍵標示）、輕擊 / 重擊 / 技能三格冷卻、「N 連擊」；操作說明加上重擊與換武器。
- 測試：Vitest 350 項（連段期限與終結技、重擊冷卻、招式範圍與 360°、輕度鎖定、資料完整性、角色 GLB 含所有招式動畫、武器節點掛在 handslot、權威層拒絕未裝備的招式、v7 → v8 遷移）；端對端新增 `e2e/melee.e2e.mjs` 13 項（三武器 × 輕擊連段與重擊實際扣血且等於資料、動畫片段正確、重擊冷卻、手上武器與裝備一致、拖尾、存檔與重開後保留）；`combat.e2e` 改用招式 id。截圖 `docs/screenshots/phase6/melee_*.png`（`--melee`；`melee_contact_sheet.png` 為 12 招總覽）。

### 任務 6B：日夜與日月光照（2026-10-13）
- 時鐘由權威狀態的遊玩秒數推導（`game-core/world/timeOfDay.ts`，存檔格式不變）：新遊戲 08:00、一天 = 現實 24 分鐘（白天 05:30–18:30 佔 16 分、夜晚 8 分），日月軌道、月相（8 天一輪）、時段（黎明 / 白天 / 黃昏 / 夜晚）（T-94）。
- 外觀（`render/timeLook.ts`）：天空、霧、半球光、方向光在關鍵時刻之間插值；迷霧外觀以時段外觀為晴朗端、迷霧端乘上時段色調（T-95）。仍只有一盞投影光：白天跟太陽、夜晚跟月亮，日出日落時降到 0 再換；夜晚以月光 + 偏藍半球光保底，看得清楚。
- 天空 shader：太陽圓盤與光暈、有月相的月亮、閃爍的星空、太陽方向的地平線暖光，不增加 draw call。遠山與地面延伸（不受光照）夜晚一起變暗。
- 夜晚生命感：草原與湖邊的螢火蟲、星光燈與營火的光暈（夜晚變大變亮）、白天鳥叫 / 夜晚蟲鳴（室內都聽不到）。
- 茉莉在夜晚（19–05 時）多一個選項「睡到早上」：時間前進到 07:00、體力回滿（`Sleep` 指令，經過的時間照常結算重生）。對話與任務條件新增 `timeRange`（之後 `quest_dawn_007` 的夜間調查用）。
- 室內不受日夜影響（固定正午的光線）。HUD 左下顯示「第 N 天 HH:MM」；除錯面板有時段滑桿（只往前推）、`__mistwoodDebug.clock() / setClock(h)`、`?clock=`（固定畫面時段，美術驗收用）。
- 修正：月亮在白天的部分時段會冒出地平線（白天與夜晚長度不同，軌道改為地平線上下各半個正弦）。邊界迷霧牆上半部改為更早淡出，低空的太陽與月亮看得到。
- 測試：Vitest 新增時鐘換算、日月方位（整個白天月亮都在地平線下）、時段外觀、`Sleep` / `DebugSetClock` 規則；端對端新增 `e2e/daynight.e2e.mjs` 9 項（時鐘前進、正午明亮、黃昏太陽在西方低空、午夜換成月光且變暗偏藍但仍可見、蟲鳴、室內不變、睡到早上、白天沒有該選項、存檔換算回同一時刻）。截圖 `docs/screenshots/phase6/daynight_*.png`（`--daynight`）。效能見 `PERF.md` Phase 6（日夜幾乎相同）。

### 任務 6A：地圖邊界（2026-10-13）
- 可玩區 ±74 m 圓角方形（`game-core/world/bounds.ts`：距離、夾住、霧濃度、邊界取樣，T-93）。外緣一圈 Rapier 靜態方塊碰撞擋住角色（跑、跳都過不去），不參與攝影機避讓。
- 迷霧牆（`world/boundary/WorldBoundary.tsx`）：沿邊界一圈的直立面，噪聲向上湧動、牆腳最濃，顏色取霧色再偏白，玩家越近越濃；牆外加兩排裝飾樹（`edge_tree_*`，不可採集、無碰撞，附加在產生腳本最後，既有物件不變），從遠處看是「濃霧中的森林」。
- 靠近邊界 4 m 內顯示「前方的迷霧太濃了……」，芽芽（露米）已同行時也會說一句；離開 8 秒後才會再提示。
- 規格書 v3（`GAME_DESIGN.md`）完成，`CLAUDE.md` 改指向新規格；決策 G-01–G-06。
- 測試：Vitest 300 項（新增邊界距離、圓角、夾住、霧濃度、取樣）；端對端新增 `e2e/bounds.e2e.mjs` 8 項（四邊與角落跑跳都停在界內且不重生、提示出現與離開、攝影機在牆外不被拉近）。截圖 `docs/screenshots/phase6/bounds_*.png`（`--bounds`）。

### 任務 5D：環境生命感（2026-10-13）
- 羊群（T-89）：村子西邊牧草地 6 隻程式產生的羊，休息 / 吃草 / 漫步，玩家靠近會走開，遠離時整群暫停；有碰撞。
- 風車扇葉轉動、曬衣繩的衣服隨風擺動（prefab `animate`，T-90）；三棟房屋的煙囪冒炊煙（prefab `smoke`，T-91）。
- 可閱讀的路標（草原小路、鏡湖西岸）與村子告示板（互動「閱讀」，T-92）。
- 測試：Vitest 289 項（羊群 AI、資料、環境動畫節點存在、羊模型部件）；端對端新增 `e2e/ambient.e2e.mjs` 6 項。截圖 `docs/screenshots/phase5/ambient_*.png`（`--ambient`，風車 a / b 兩張比對扇葉角度）。

### 任務 5C：手把（2026-10-13）
- Gamepad API 接到輸入層（T-87）：左搖桿類比移動、右搖桿視角、按鈕對應動作（固定配置，設定畫面唯讀列出），Menu 暫停。
- 選單以手把操作（T-88）：十字鍵 / 左搖桿選按鈕（黃色外框）、A 確認、B 返回，適用主選單、暫停、設定（含音量滑桿）、對話選項、背包、建造選單與訊息。
- 提示文字依最近使用的裝置顯示手把按鈕（互動提示、教學、戰鬥按鈕、操作說明）。
- 開發工具：端對端與截圖的遊戲視窗改在背景執行，不搶焦點、排在使用者視窗後面（T-85）；存檔寫入時主檔不再短暫消失、`combat.e2e` 偶發失敗修正（T-86）。
- 測試：Vitest 275 項（手把配置、死區、導覽方向與連續移動、空間導覽）；端對端新增 `e2e/gamepad.e2e.mjs` 10 項（以除錯 API 模擬手把）。截圖 `docs/screenshots/phase5/gamepad_*.png`（`--gamepad`）。

### 任務 5B：可進入建築（2026-10-13）
- 村莊酒館可進入：門口提示「進入 酒館」，黑幕轉場到室內子場景（遠方座標，T-83）；木地板、灰泥牆、橫樑、窗、石砌壁爐與爐火暖光（閃爍），吧台、櫃子、地毯、桌椅、木桶、燈。門墊「離開 酒館」回到門口、背對建築。室內沒有霧、不顯示天空與地形，攝影機拉近抬高。
- 酒館老闆茉莉（T-84）：對話可休息（體力回滿，`Rest` 指令）與兩段閒聊。
- 在室內存檔記錄門口位置，讀檔從門口開始。
- 測試：Vitest 266 項（室內資料驗證、室內範圍、室內物件不與開放世界重疊、`enter` prefab 驗證、休息）；端對端新增 `e2e/tavern.e2e.mjs` 6 項。截圖 `docs/screenshots/phase5/tavern_*.png`（`--tavern`）。

### 任務 5A：音效與音樂（2026-10-13）
- Kenney CC0 音效：草地 / 木橋腳步、砍樹、敲石頭、摘花、拾取、寶箱、接取與完成任務、建造、修橋、揮砍、命中、受傷、擊敗、技能、對話、露米、介面按鈕、拒絕（T-80、T-82）。
- 程式合成的環境音（風、鳥叫、迷霧嗡鳴、湖邊水聲）與生成式背景音樂；迷霧越濃音樂越暗並轉小調、鳥叫消失（T-81）；暫停時音樂停止。
- 設定畫面加入主音量、音樂、音效滑桿並存檔。
- 測試：Vitest 255 項（腳步間隔與地面、音量設定格式）；端對端新增 `e2e/audio.e2e.mjs` 8 項（以播放紀錄與音訊狀態驗證）。

### Phase 4 驗收（2026-10-13，規格第 9 節）
| 驗收條件 | 結果 | 證據 |
|---|---|---|
| 可放置 / 旋轉 / 確認 | 通過 | `build.e2e`：選單選擇、預覽、R 旋轉 45°、E 確認放置；規則單元測試（網格與旋轉吸附） |
| 無效位置不可放 | 通過 | `build.e2e`：小島外 / 水裡、與既有建造物重疊都顯示原因且按 E 無效；規則測試另含坡度與世界物件 |
| 材料不足不可建 | 通過 | `build.e2e` 顯示「材料不足」、按 E 無效；確認前不扣材料 |
| 重啟後仍在 | 通過 | `build.e2e` 存檔 → 重開「繼續遊戲」：類型、位置、旋轉都還原；存檔 v7 遷移測試 |

### 任務 4B：家園（2026-10-13）
- 拆除工具（對準標示、全額退還）、營火旁回血加快與提示（T-77）；建造物腳下不長草（T-78）；小島區域提示、巴魯與露米的建造引導（T-79）。
- 測試：Vitest 253 項；`build.e2e` 增為 13 項（區域提示、營火提示、以介面拆除）。截圖 `docs/screenshots/phase4/build_remove.png`。

### 任務 4A：建造系統（2026-10-13）
- 湖心小島「旅人小屋」（`home` 區域）可建造（T-73）：營火、小木屋、木桌、木椅、木凳、長椅、星光燈、花圃、南瓜擺飾、旗子（T-75）。
- 建造選單（材料持有 / 需求）、預覽幽靈物件（綠 / 紅與原因）、網格吸附、45° 旋轉、確認後才扣材料；放置檢查為 game-core 純函式，權威層再驗證（T-74、T-76）。已放置物 instancing 渲染、有碰撞，營火有跳動的火焰；拆除全額退還（指令已完成，介面於 4B）。存檔 v7。
- 測試：Vitest 251 項（放置檢查、放置 / 拆除、網格與旋轉吸附、v6 → v7 遷移、區域重疊）；端對端新增 `e2e/build.e2e.mjs` 11 項（含重啟後仍在）。截圖 `docs/screenshots/phase4/build_*.png`（`--build`）。

### Phase 3 驗收（2026-10-13，規格第 9 節）
| 驗收條件 | 結果 | 證據 |
|---|---|---|
| 可擊敗敵人 | 通過 | `combat.e2e`：左鍵與 Q 實際命中扣血、擊敗後消散與掉落；規則單元測試 |
| 任務可接 / 完成、獎勵正確 | 通過 | 三個任務：`quest.e2e`（木材）、`lake.e2e`（修橋）、`combat.e2e`（驅散迷霧）都由 NPC 對話接取與回報，交出物品與獎勵數量正確、不可重複領取 |
| 任務與 `mistStage` 可存讀 | 通過 | 存檔 v3–v6 遷移與讀寫測試；`region.e2e` 重開後森林仍晴朗；`quest / lake / combat.e2e` 檢查存檔內容 |
| 完成清除任務後森林外觀明顯變亮 | 通過 | `combat.e2e` 回報後森林晴朗、迷霧生物消散；`region.e2e` 以畫面飽和度驗證森林由濃轉清明顯變亮；截圖 `phase3/region_forest_dense.png` / `region_forest_clear.png` |
| 範圍：迷霧生物、攻擊與技能、NPC 對話、三個任務、`mistStage` ↔ `uMist` 連動、星光夥伴 | 完成 | 任務 3A–3F |
| 效能 | 通過 A 級預算 | `PERF.md` Phase 3 複測 |

### 任務 3F：星光夥伴（2026-10-13）
- 露米：打開序章寶箱後出現並打招呼，跟隨玩家，按 H（可重新配置）依進度給提示，任務可以回報時主動提醒；解鎖旗標存檔 v6（T-71）。新增動作後舊的按鍵設定仍有效（T-72）。
- 測試：Vitest 230 項（解鎖、提示挑選、v5 → v6 遷移、按鍵設定合併）；端對端新增 `e2e/companion.e2e.mjs` 6 項。截圖 `docs/screenshots/phase3/companion_*.png`（`--companion`）。

### 任務 3E：戰鬥與迷霧生物（2026-10-13）
- 迷霧生物（程式產生、蠕動的霧與發光眼睛，T-65）：AI 狀態機、依距離降頻、出手前鼓起轉紅、被擊中閃白與擊退、擊敗後淡出與掉落。
- 玩家：左鍵攻擊（前方扇形）、Q「星光衝擊」（周圍範圍、6 秒冷卻、金色光環與星點），傷害數字、受傷閃紅、體力條、技能冷卻顯示；體力歸零倒下，3 秒後滿血回到村子路口；脫離戰鬥 5 秒後回血（T-66）。
- 生成依森林迷霧階段（T-67）。第三個任務「驅散森林的迷霧」（雷歐）：擊敗 6 隻，3 隻時森林迷霧變淡，回報後森林晴朗、迷霧生物全部消散（T-68）。存檔 v5（T-69）。
- 攝影機遮擋改為鏤空、攝影機穿過樹幹（T-64，解決 Phase 1 的已知問題）。
- 測試：Vitest 223 項（生成、攻擊、擊敗、任務里程碑、倒下與重生、回血、命中範圍、AI 狀態機、v4 → v5 遷移）；端對端新增 `e2e/combat.e2e.mjs` 9 項；`world.e2e` 的攝影機測試改為「樹幹不拉近、建築會拉近」；端對端的存檔版本改由 schema 讀取。截圖 `docs/screenshots/phase3/combat_*.png`（`--combat`）。

### 任務 3D：湖泊、木橋與修橋任務（2026-10-13）
- 出生點東邊的「鏡湖」：湖底與沙岸、小島、手繪感水面（深淺、波紋、泡沫）；落水回到最近的安全點（T-59）。
- 木橋（程式模型，T-60）：損毀 / 修復兩狀態，外觀與碰撞依權威狀態切換，修好的狀態存檔（T-61）。欄杆擋角色但不拉近攝影機（T-62）。
- 第二個任務「修復湖邊的木橋」：完成木材任務後向巴魯接取 → 帶 8 木材 + 4 石頭到橋頭修理（只在任務進行中可修，材料不足會提示）→ 走過橋到小島 → 回報巴魯，獲得星光碎片與草藥，鏡湖迷霧清除。任務追蹤顯示修理所需材料。
- 測試：Vitest 205 項（修理規則、修復目標、多形狀碰撞、修好狀態存檔、DebugGiveItems）；端對端新增 `e2e/lake.e2e.mjs` 9 項；`quest.e2e` 改為完成後提出修橋任務。截圖 `docs/screenshots/phase3/lake_*.png`（`--lake`）。

### 任務 3C：任務系統與第一個任務（2026-10-13）
- 任務狀態表（Locked / Available / Active / Completed）、接取與回報指令、收集目標、物品與迷霧獎勵（T-57）；存檔 v4 遷移。
- 對話選項效果（接任務、回報）與任務條件；巴魯依任務進度說不同的話。
- 第一個任務「修橋用的木材」：向巴魯接取 → 收集 6 根木材 → 回報交出木材、獲得星光碎片（T-58）。
- 任務追蹤（左側，目標進度與回報對象）、接取 / 完成 / 交出物品通知；接取與完成時自動存檔。
- 測試：Vitest 197 項（任務規則 10 項、v3 → v4 遷移）；端對端新增 `e2e/quest.e2e.mjs` 7 項。截圖 `docs/screenshots/phase3/quest_tracker.png`。

### 任務 3B：NPC 與對話（2026-10-13）
- 星光村三位 NPC：米拉長老（井邊）、木匠巴魯（木材堆旁）、守衛雷歐（南邊路口巡邏）；骨架動畫（待機、走路、說話手勢）、碰撞、對話時停下並面向玩家、巡邏時遇到玩家會讓路（T-54）。
- 節點式對話資料與流程：多段、選項（數字鍵 / 點擊）、條件選項與條件對話；對話視窗（說話者名牌、文字、選項、繼續提示）（T-55）。不引入 XState（T-53）。
- 互動系統同時處理世界物件與 NPC（「交談 米拉長老」）；對話、背包、訊息視窗開啟時隱藏操作說明列。
- 測試：Vitest 185 項（對話流程、條件、巡邏、資料參照）；端對端新增 `e2e/npc.e2e.mjs` 11 項。截圖 `docs/screenshots/phase3/npc_*.png`（`--npc`）。

### 任務 3A：各區域迷霧（2026-10-13）
- 區域資料（草原、星光村、迷霧森林；湖泊、家園、觀景點、遺跡待場地加入）與各區域迷霧階段（權威狀態、存檔 v3 遷移，T-49、T-52）。
- 畫面迷霧依玩家位置在區域間平滑混合；森林預設濃霧，改為「清」後明顯變亮、變鮮豔（端對端以畫面飽和度驗證）。
- 進入新區域顯示區域名稱與迷霧狀態，並自動存檔（T-51）。除錯面板：覆寫 / 依區域、設定目前區域的迷霧階段（T-50）。
- 測試：Vitest 177 項（區域判定與混合、迷霧指令、v2 → v3 遷移）；端對端新增 `e2e/region.e2e.mjs` 8 項。截圖 `docs/screenshots/phase3/region_forest_*.png`（`--region`）。

### Phase 2 驗收（2026-10-13，規格第 9 節）
| 驗收條件 | 結果 | 證據 |
|---|---|---|
| 資源取得正確 | 通過 | 規則單元測試（掉落數量、背包堆疊、全部放得下才成功）；`harvest.e2e` 樹 / 岩石 / 花 / 草藥各自取得對應物品 |
| 唯一獎勵不重複 | 通過 | 規則測試（already-open）；`world.e2e` 重複按 E 星光碎片仍為 1；`save.e2e` 讀檔後仍不能再領 |
| UI 與世界狀態一致 | 通過 | `harvest.e2e` 背包格子數量 = 權威狀態；樹樁 / 消失與狀態一致；提示只在可互動時出現 |
| 重開遊戲後背包與採集狀態仍在 | 通過 | `save.e2e` 存檔 → 關閉 → 重開「繼續遊戲」：背包、樹樁、寶箱、位置、設定都還原 |
| 存檔損壞仍可啟動 | 通過 | `save.e2e` 主檔損壞 → 用備份並通知；主檔與備份都損壞 → 提示、可開新遊戲、無錯誤畫面 |
| 存檔遷移測試通過 | 通過 | 遷移框架測試 + 實際 v1 → v2（教學欄位）測試 |
| 範圍：Authority / 指令 / 事件、互動物件、採集、寶箱、背包、存檔框架、主選單與設定、教學引導、i18n 結構 | 完成 | 任務 2A–2E；音量設定待 Phase 5 音效 |

### 任務 2E：設定畫面與按鍵重新配置（2026-10-13）
- 主選單與暫停選單的「設定」：畫質、10 個動作的主要 / 次要按鍵（含滑鼠按鍵），衝突時自動從原動作移除並提示，Esc 取消、Backspace 清除、還原預設（T-47、T-48）。
- 按鍵設定寫入設定存檔，重開後保留；操作說明、互動提示、教學與背包提示都顯示目前的按鍵。
- 測試：Vitest 168 項（新增 rebind 6 項）；端對端新增 `e2e/settings.e2e.mjs` 9 項（含重開保留與在遊戲中生效）。截圖 `docs/screenshots/phase2/menu_settings.png`。

### 任務 2D：教學引導（2026-10-13）
- 出生草原的四步引導（規格 6.9）：移動 4 m → 打開寶箱 → 採集一次 → 打開背包 → 結語（往北走到村莊，9 秒後消失）。畫面上方提示框與進度點，只在遊玩中顯示。
- 進度為權威狀態並寫入存檔（T-45）；存檔格式升為 v2，第一個實際遷移 v1 → v2（T-46）。
- 測試：Vitest 162 項（新增教學規則、步驟條件、實際 v1 存檔遷移）；端對端新增 `e2e/tutorial.e2e.mjs` 7 項。截圖 `docs/screenshots/phase2/follow.png`。

### 任務 2C：存檔框架（2026-10-13）
- **格式與規則**（game-core `save/`，T-40）：第 1 版存檔含玩家位置與面向、遊戲時間、世界物件差異、背包；zod 驗證；遷移框架；讀檔「主檔 → 備份 → 損壞」；資料檔已移除的物件 / 物品略過並警告（T-41）。
- **儲存**：Electron 主程序 `electron/saveFiles.ts`（原子寫入 + `.bak.json` 滾動備份 + 欄位白名單）經 IPC（preload 只暴露 list / read / write / readText）；網頁開發模式 IndexedDB（同介面）。
- **流程**：主選單「繼續遊戲」（顯示存檔時間與遊玩時間）、「新遊戲」（有存檔時需確認）；主檔損壞自動用備份並通知；全部損壞時顯示提示、仍可開始新遊戲。暫停選單「儲存遊戲」「匯出存檔」與存檔狀態；回主選單前自動存檔；採集 / 開箱後與每分鐘自動存檔（T-42）。
- **設定值存檔**：畫質寫入 `settings` 欄位，下次啟動讀回。
- 測試：Vitest 156 項（新增存檔轉換、遷移、讀檔備援 16 項；`electron/saveFiles.test.ts` 6 項：原子寫入、備份、損壞、暫存檔殘留、路徑穿越、列表）；端對端新增 `e2e/save.e2e.mjs`（6 次啟動、12 項：存檔 → 重開還原、自動存檔、匯出、主檔損壞、全部損壞、IndexedDB），所有端對端改用暫存的存檔與使用者資料夾（T-44）；`dev.e2e` 的鎖定滑鼠流程改寫（T-32 補充）並改為「回主選單 → 繼續遊戲 → 新遊戲」。
- 截圖：`docs/screenshots/phase2/menu_title.png`（繼續遊戲）、`menu_title_confirm_new.png`、`menu_pause.png`（儲存 / 匯出）。

### 任務 2B：背包介面（2026-10-13）
- I / Tab（依 `keybindings.json`，可重新配置）開關背包；Esc 也可關閉且不會同時開啟暫停選單。
- 24 格、物品圖示與數量、滑過或點選格子顯示名稱、分類、持有數與說明；只讀權威狀態。
- 開啟時釋放滑鼠、角色停止移動（`isModalOpen`）；關閉時重新鎖定滑鼠；暫停或回主選單時自動關閉。
- 截圖 `docs/screenshots/phase2/inventory.png`（`--harvest` 一併輸出）。端對端 harvest 新增 5 項。

### 任務 2A：Authority、物品、背包與採集（2026-10-13）
- **權威層**（規格 3.2，T-33）：`game-core/authority/rules.ts` 純函式 `handleCommand` / `applyEvents`；指令 `HarvestObject`、`OpenChest`、`AdvanceTime`；事件 `ObjectHarvested`、`ObjectRespawned`、`ChestOpened`、`ItemsGained`、`TimeAdvanced`、`CommandRejected`。`LocalAuthority`（send / subscribe / getState / replaceState）。UI 與 3D 只讀 `useGameStateStore`。
- **物品與掉落表**：`data/items.json`（木材、石頭、花朵、草藥、星光碎片）、`data/lootTables.json`；zod 驗證並檢查跨檔參照（prefab 的掉落表必須存在）。
- **背包**（規格 6.3）：24 格、堆疊上限、全部放得下才成功（T-34）、消耗與材料檢查（`hasItems` / `removeItems`，供修橋與建造使用）。
- **採集**（規格 6.2、5.2）：樹木（揮砍 → 樹樁，T-37）、岩石（敲 → 消失）、花叢與草藥（摘 → 消失，程式模型 T-38）；不可重複採集；依遊戲時間重生，玩家站在旁邊時延後（T-36）。寶箱改為給予星光碎片與草藥，背包滿時保持關閉。
- **回饋**：取得物品的通知（含 SVG 物品圖示，T-39）、背包已滿通知；互動提示「採集 樹木 / 岩石 / 花叢 / 草藥」。
- 新增 30 叢花、18 叢草藥的 placement（出生點外圍 8 叢供教學）；`gen-placements.ts` 附加在最後產生，既有物件位置不變。
- 截圖：`docs/screenshots/phase2/`（`--harvest`：花叢、草藥特寫、砍樹提示 / 揮砍中 / 樹樁與通知），已檢視：花色鮮明、樹樁正確、無粉紅材質。
- 測試：Vitest 134 項（新增規則 15、背包 7、物品與掉落 5、Authority 3、程式模型）；端對端新增 `e2e/harvest.e2e.mjs` 9 項（共用 `e2e/lib.mjs`），寶箱測試改為檢查星光碎片入袋與不可重複領取。

### 修正：開發模式轉動視角後畫面停住（2026-10-13）
- 原因：React StrictMode（只在開發模式）會重複掛載元件，Rapier 角色控制器被釋放後仍被使用，每幀拋錯，渲染迴圈停止（DECISIONS T-21）。
- 修正：控制器改在 effect 內建立、cleanup 釋放。未捕捉的錯誤改為顯示在畫面上（T-22）。
- 新增 `e2e/dev.e2e.mjs`：以開發模式實際操作（主選單 → 開始 → 轉視角、邊走邊轉 → 暫停 → 繼續 → 回主選單 → 再開始），任何未捕捉錯誤即失敗；已加入 `pnpm e2e`。

### Phase 1 美術收尾與驗收項目（2026-10-13）
- **小村莊**：KayKit Hexagon 的房屋 ×3、酒館、井、風車、柵欄牧場、木桶、木箱、手推車、木材堆等（CC0），村莊範圍地形壓平；「村莊」書籤現在有實際村莊。碰撞形狀支援 `offset`。
- **森林**：東北角加入 70 棵較密的樹林（「森林」書籤）。書籤鏡頭前方保持淨空。
- **地形**：shader 內程式產生 splat（筆刷感草地色塊、向陽黃綠斑、不規則邊緣的泥土路與碎石、陡坡岩石），取代頂點色（T-24）。
- **草與野花**：instanced 草叢與五色小花，風動（根部固定、大範圍陣風）、依距離縮入地面、16 m 區塊剔除，避開小路與所有碰撞體；顏色與地面一致（T-25）。
- **遠景**：程式產生的兩層環狀山脈（空氣透視、跟隨迷霧）、地圖外地面延伸、緩慢飄移的雲（T-26）。
- **陰影**：陰影相機跟隨攝影機前方，解決近景鋸齒與樹冠條紋（T-27）。
- **後處理與畫質三級**：Bloom、飽和度（跟隨迷霧）、暗角、tone mapping、MSAA；低／中／高控制草花密度、可見距離、後處理、陰影解析度、像素比（T-28、T-29）。除錯面板、主選單、暫停選單都可切換；`?quality=`。
- **主選單與暫停選單**：開始遊戲／畫質／離開遊戲；遊玩中 Esc 暫停（繼續／畫質／回主選單）。暫停時角色與互動停住。回主選單再開始會重置（尚無存檔）（T-30、T-31）。
- **實機效能量測**：`scripts/perf.mjs`，結果見 `PERF.md`。M1 Pro 全部視角 120 FPS（vsync），不限幀最低 226 FPS；draw calls 最多 122、三角面最多 39 萬、冷啟動 1.3 s；3 分鐘連續遊玩資源數量持平。**不需要串流載入**。
- 截圖：`docs/screenshots/phase1/`（4 書籤 × 晴朗／迷霧、跟隨與角色特寫、互動 3 張、主選單、暫停選單），已逐張檢視：無粉紅材質、模型皆載入、比例正常。
- 測試：Vitest 104 項（新增遊戲流程、植被散佈與畫質、碰撞位移與佔用查詢、村莊地形）；端對端 movement 11、world 10、dev 8 通過＋1 項依環境略過（T-32）。

### 任務 1C：碰撞與互動 + `uMist` 滑桿（2026-10-13）
- **正式素材替換佔位樹**：KayKit Medieval Hexagon（樹 2 種、岩石 3 種）與 KayKit Dungeon Remastered（寶箱），與角色同作者、同風格，CC0。佔位松樹與其產生腳本已移除。`scripts/gen-placements.ts` 產生 150 棵樹、34 顆岩石、1 個寶箱，並避開出生點、小路與攝影機書籤位置。
- **環境碰撞**：prefab 宣告簡化碰撞形狀（圓柱 / 方塊，`collision`），`static` 必填（zod 驗證）。`WorldIndex` 建立空間格網，`EnvironmentColliders` 每 0.25 秒只為玩家 30 m 內的物件向 Rapier 建立碰撞體（35 m 外移除，避免邊界抖動）；目前約 12–28 個。攝影機 shape cast 自動對樹、岩石、寶箱避讓。
- **掉落重置至最近安全點**：`game-core/world/safePoints.ts` 沿途記錄站穩 0.3 秒以上、距地圖邊緣 6 m 以上的位置（間距 2 m，最多 32 個）；掉出地圖時回到離掉落處最近者，沒有記錄時回出生點。
- **第一個可互動物件（寶箱）**：靠近 → 提示「[E] 打開 寶箱」→ E → `Interact` 指令 → game-core `handleInteract` 驗證 → `ChestOpened` 事件 → `worldStore` 更新 → 角色轉身播放 Interact 動畫、蓋子掀開、顯示紙條訊息。已開啟的寶箱不再提示、不可重複領取（`ObjectRuntime.open`，Phase 2 存檔）。互動目標以空間格網查詢附近候選，再依距離與面向選擇（`game-core/interaction/target.ts`），不對所有物件做射線。
- 訊息視窗開啟時釋放滑鼠、角色停止移動；E / Esc / 按鈕關閉。
- **迷霧外觀 `uMist`**（規格 4.5）：單一 uniform 驅動霧色與可見距離、天空、半球光與主光、所有 toon 材質與地形的去飽和偏冷；除錯面板有滑桿與「濃 / 淡 / 清」三段按鈕，`?mist=0–1` 網址參數，變化約 1 秒平滑過渡。
- 截圖腳本新增 `--mist`（每個書籤加拍迷霧版）與 `--interact`（互動提示、開箱、開箱後）；`docs/screenshots/phase1c/`。
- 測試：Vitest 78 項（新增空間格網、安全點、互動目標、寶箱指令 / 事件、迷霧、WorldIndex、世界資產檔案）；端對端 22 項（新增 `e2e/world.e2e.mjs` 11 項：碰撞體依距離啟用、走向樹幹被擋、攝影機對樹拉近與退回、互動提示出現 / 消失、開箱、視窗開啟時不能移動、不可重複領取、寶箱碰撞、迷霧漸變與去飽和、滑桿；掉落測試改為驗證回到最近安全點）。
- 打包版（`pnpm run pack`）已啟動驗證：場景就緒、碰撞體啟用、無錯誤、`require` 不可用。

### 任務 1B：角色與移動（2026-10-12）
- **動畫來源驗證（Phase 0 閘門）通過**：KayKit Adventurers「Rogue_Hooded」（CC0，約 2 頭身 Q 版、縮放為 1.6 m）。
  - 自動化：`src/game/character/characterAssets.test.ts` 驗證規格 4.6 的 9 個動畫全部存在、只有一套骨架、動畫只驅動骨架節點。
  - 視覺：`node scripts/screenshot.mjs <階段> --anim` 輸出各動畫定格；`docs/screenshots/phase1b/anim_contact_sheet.png` 九宮格檢視，無變形、無拉伸。
- 輸入層：`game-core/input/actions.ts`（動作、綁定驗證、反查）＋ `game/input/inputManager.ts`（鍵盤 / 滑鼠 / 滾輪 / 滑鼠鎖定；失焦放開所有鍵）。按鍵定義於 `data/keybindings.json`，可重新配置；預留手把。
- 移動邏輯（純函式）：`game-core/character/locomotion.ts` — 攝影機相對方向、加減速、斜向不加速、coyote time、禁止二段跳、落地判定、面向旋轉、動畫狀態（idle / walk / run / jump / fall / land）。
- 物理：Rapier kinematic 角色控制器 + 膠囊；地形 trimesh 碰撞（與渲染網格同源）；自動上台階、貼地、坡度上限 50°；掉出地圖回出生點。
- 角色外觀：SkeletonUtils 複製、toon 材質、隱藏武器掛件、交叉淡入淡出動畫；外觀依本幀計算位置擺放，與攝影機無一幀落差。
- 跟隨攝影機：滑鼠旋轉（點擊畫面鎖定，Esc 釋放）、滾輪縮放、仰角限制、平滑跟隨、**shape cast 碰撞避讓**（被擋立即拉近、解除平滑退回）。
- 除錯：「跟隨角色 / 自由視角書籤」切換、角色特寫書籤、`__mistwoodDebug.playerState / teleport / camera / previewAnimation`。
- 操作提示 HUD（i18n）。
- 測試：Vitest 41 項；**端對端 11 項**（`pnpm e2e`，以真實鍵盤事件在 Electron 中驗證走 / 跑 / 停 / 斜向 / 跳 / 二段跳 / 貼地 / 攝影機距離 / 攝影機避讓 / 掉落重生）。

### 任務 1A：骨架與場景（2026-10-12）
- Electron 44 + Vite 8 + React 19 + TS strict + R3F 9 + Tailwind 4（pnpm）。
- Electron 安全設定（contextIsolation、sandbox、無 nodeIntegration、最小 preload、CSP、禁止外部導向），已在打包版驗證。
- `game-core` 純邏輯層 + ESLint 依賴限制；資料四層型別與 zod 驗證。
- 草原場景、instanced GLB 樹木、天空、光照、霧、toon、FPS 面板、攝影機書籤、截圖腳本、桌面版建置。

## 進行中
（無）

## 下一步：Phase 6（戰鬥與世界表現，`GAME_DESIGN.md` §5）
依序、單次一個可驗收功能：
1. ~~任務 6A 地圖邊界~~（完成）
2. ~~任務 6B 日夜與日月光照~~（完成）
3. ~~任務 6C 近戰：拳、踢、刀、劍~~（完成）
4. ~~任務 6D 魔法核心與 VFX 引擎~~（完成）
5. ~~任務 6E 流星雨與魔法打磨~~（完成）
6. ~~任務 6F 名稱與設定對齊 Bible~~（完成）
7. 任務 5E 效能與發行：B 級畫質校正、資產壓縮、Windows 安裝檔、macOS 打包（D-04）、乾淨環境安裝測試；Phase 5、6 驗收。
8. Phase 7 晨曦谷地完整 MVP（§9）。

## 使用者新指示（2026-10-14，優先於上方順序）：擴大第一章地圖、建立第二章，另加世界地圖、小地圖、場景豐富化、多樣怪物
進度：7A、7B、7C、8A、8B、8C、8D-1、8D-2 完成（Phase 8 螢苔祕林完成）。接著回到 Phase 7 晨曦谷地 MVP（GAME_DESIGN §9）：7D「燈塔的最後一盞光」完成（T-141–T-144）；7E 霧團噗啾王完成（T-145–T-147）；7F 任務日誌完成（T-148）；7G 郵袋裡的三封信完成（T-149）；7H 米菈的雜貨補給完成（T-150）；7I 使用消耗品完成（T-151）；7J 琳娜的草藥桌完成（T-152）；7K 花園第一顆種子完成（T-153）；7L 河邊的腳印完成（T-154）；7M 燈塔下的影子完成（T-155）。Phase 7 晨曦谷地 MVP 剩下：`quest_dawn_001`「找到回家的路」（序章已有對應的教學，需要對照 Bible 補齊）、波木木工坊、NPC 動物模型替換、村屋窗燈；之後 Phase 9 澄鏡湖。7N 村屋窗燈完成（T-156）；7O 找到回家的路完成（T-157）。7P 動物居民完成（T-158）。Phase 7 晨曦谷地 MVP 只剩波木木工坊（與家具配方一起，屬於 Bible §26 的製作延伸），列為之後再做。9A 澄鏡湖的地圖與場景完成（T-159）。9B 湖區怪物完成（T-160）。9C 伊芙與「湖面不肯忘記」完成（T-161）。9D 水鏡光路謎題完成（T-162）。9E-1 頭目璃漪完成（T-163）。9E-2 潮之共鳴完成（T-164），Phase 9 澄鏡湖主線完成。完整 e2e 全過（44 個 suite）。GAME_DESIGN §2.2 / §9 把風語草原也列在 Phase 9，下一步是 9F 風語草原地圖（進行中，見檔首「交接」），之後 9G 草原怪物（風絮團 `mob_windfluff` 已在 7C 用 GreenBlob 做過，比照 9B 水泡精升級成 Bible 版本）、9H 霏與 `quest_meadow_001`（風訊號旗、上升氣流）、9I 三座風車 `quest_meadow_002`（風流滑行）、9J 頭目呼咻 `quest_meadow_003`。澄鏡湖的支線（伊芙的燈船、沒有寄出的信、沉沒鐘樓的寶箱，Bible §7.9、§22）之後再補。
原規劃（7A 實作時的差異見 DECISIONS T-103–T-109：北方是 -Z，所以高地在 z < -100）：
已完成調查，規劃如下（單次一個任務；驗證依 `mistwood-verify` 分層執行）：
- **任務 7A 晨曦谷地擴大**：`TERRAIN_SIZE` 160 → 320（Bible §5.2），可玩區 ±148、圓角 18；地形網格 320 段。既有中心內容（出生點、村莊、湖、森林）座標不變，`gen-placements.ts` 舊散佈保留原 `half = 74` 以維持 id/位置，舊邊界樹移除、新邊界重新產生。
  - 地形：北方高地（懸崖線 `cliffZ(x) = 95 + 6 sin(0.05x) + max(0, x−60)²·0.02`，高 10 m，主路處做緩坡）、東側河谷（折線河道，下切到湖底高度，兩處淺灘＋一座木橋，水面改為沿河道的帶狀網格、水深改用頂點屬性）、望星丘（−85, 88，高約 16 m）、數個小丘、西坊農田平台、古樹遺跡（88, 95）；`distanceToPath` 改為主路＋支線折線網路；`FLAT_PADS` 給房屋用的整平區；落水判定改為一般化的「低於水面」。
  - 區域：新增 `highland`、`farmland`、`river`，`overlook`、`ruins` 補上範圍 → 存檔 v10 遷移（補齊缺少的區域迷霧階段）。
  - 房屋與裝飾：KayKit 六角包（home_A_red、home_B 各色、blacksmith、lumbermill＝波木木工坊、market、church、watermill、grain、tower_A＝燈塔暫用、destroyed、wall、fence_stone、target、tent）＋ Kenney Nature Kit CC0（橡樹/松樹/秋色樹、作物、懸崖、瀑布、石柱/石環/方尖碑、樹樁、圓木、蘑菇、睡蓮、灌木）。下載來源：GitHub `KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0`、`https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip`；需登記到 `ASSETS.md`。
  - 其他要跟著改：`Backdrop` 山脈半徑（240/330 → 約 300/420）、`safePoints` halfExtent、`e2e/bounds.e2e.mjs` 的 HALF/CORNER、`e2e/movement.e2e.mjs` 東邊界判定、新攝影機書籤；物件變多後量測三角面（目前約 46 萬），必要時把 InstancedPrefab 依空間分塊做剔除。
- **任務 8A–8D 螢苔祕林**（Bible §6）：同一物理世界的遠處偏移座標（例如原點 x = 2000，比照室內子場景），`terrainHeight`、邊界、區域依座標分派到各地圖；8A 地圖切換與場景景觀、8B 三種怪物、8C 琳娜/奇奇與水道謎題任務、8D 頭目苔咚。決策需記入 `DECISIONS.md`。
- 基準截圖：`docs/screenshots/baseline7/`。

## 待使用者處理（不阻擋開發）
0. **效能重測（Phase 6、7、8A）**：在無人操作、關閉 Chrome 時執行 `node scripts/perf.mjs` 與 `node scripts/perf.mjs --magic`，補進 `PERF.md`（6E 與 Phase 7 的量測都受到干擾；Phase 7 的每幀時間約為 Phase 6 的 2 倍，需確認是否為環境因素）。
1. **風格判定（規格 4.8）**：把參考圖放進 `docs/art/reference/`，與 `docs/screenshots/phase1/`、`phase2/` 並排比對。
2. **B 級機器量測**：在 M1 / Iris Xe 8 GB 等級的機器執行 `node scripts/perf.mjs`，補進 `PERF.md`。
3. **多人連線上線用的帳號（Phase 4–5 才需要，Phase 3 不需要）**：Vercel、Render 帳號與 GitHub repo 授權；Supabase 專案（URL、publishable key；secret key 由使用者自己貼進 Render 的環境變數）；`online-plan.md` §8 的待決定事項。
4. **安全**：`git remote -v` 的網址裡含有 GitHub 個人存取權杖（`https://ghp_…@github.com/...`），建議撤銷這把權杖、改用 `gh auth login` 或系統鑰匙圈，並把 remote 改回不含權杖的網址。
5. **LINE 登入已移除（T-188）**：遊戲裡不再有 LINE 按鈕；Supabase 後台 Authentication → Providers 的 `custom:line` 與 LINE Developers 的頻道可以自行關閉。

## 已知問題
- `garden`「回報桃樂；時間過去後花圃開花」偶發失敗（0 !== 2，2026-10-22）：測試用 `setClock(20)` 推進遊玩時間看花圃成長，結果偶爾停在第 0 階段；同一程式單獨跑 4 次全過。之後若再出現，要檢查測試開始時的共享時鐘（測試沒有固定時段）。
- `garden` e2e 的「時間過去後花圃開花」在完整連跑時失敗一次（2026-10-21，1 !== 2），單獨重跑通過；若再出現，檢查快轉時間與花圃生長的判定時機。
- **`world.e2e`「迷霧滑桿：迷霧時畫面明顯去飽和」與 `region.e2e`「森林清除後畫面變鮮豔」都與時間有關**（2026-10-20 發現；`world` 在傍晚重跑又通過）：日光改看共享世界時鐘（T-181）後，測試沒有固定時刻；在遊戲夜晚執行時迷霧反而讓飽和度變高（0.817 → 0.870），改動前的版本同樣失敗。修法：測試開始時 `setClock` 到白天。
- **截圖腳本的書籤沒有固定時刻**：共享世界時鐘一直在走，同一書籤不同時間拍的光線不同（12B 的截圖是傍晚）。之後可以讓截圖預設 `setClock` 到白天。
- **第二章過渡期（12A–12E）**：螢苔祕林目前沒有怪物、沒有任務，只有地形、點綴、採集點與寶箱；C–G 只有地形與一般散佈；`activate.afterBoss`（擊敗頭目後才能啟動）沒有資料在用、也沒有測試，根噬者用到時補。
- `melee` e2e 的「fist 右鍵重擊」在完整連跑時偶爾沒打中（2026-10-17，48 → 48），單獨重跑通過；若再出現，檢查飛踢的命中判定時機與目標站位。
- 帳號（11G）：驗證碼信件需要在 Supabase 後台把 Magic Link **與 Confirm signup**（第一次登入的信箱用這份）範本都改成含 `{{ .Token }}`，否則玩家收不到可以輸入的數字（見 `docs/multiplayer/accounts.md`）。寄信改用 Resend（SMTP 設定在 Supabase 後台，步驟見 `docs/multiplayer/accounts.md`）。
- `server/WorldRoom.test.ts` 的「兩個人看得到彼此」在整組 `pnpm check` 並行時偶爾逾時（單獨重跑 3 次全過，與帳號改動無關）。
- 聊天（任務 11F）：名字沒有帳號驗證、不唯一，任何人都能取別人的名字；靜音只在本機，換電腦或清除瀏覽器資料就沒了。髒話詞表是基本版，待使用者過目補充。這些在 11G 登入後改成帳號層級。
- 多人連線（任務 11E）：怪物仍是各客戶端各自一份，兩個人看到的怪物位置與血量不同，對方的攻擊與法術只是表現、不會打到自己畫面上的怪物（Phase 6 伺服器權威才共享）。使用者回報正式網址「有時頓頓的」，原因未確認：先分辨是整個畫面卡（瀏覽器 FPS）還是只有對方的角色頓（網路抖動）。
- 8A 的完整 `pnpm e2e` 連跑時 `magic.e2e` 的星屑飛彈一次沒命中（單獨重跑通過），與下一條同一類。
- 地圖擴大後，連續跑完整 `pnpm e2e` 時偶爾有一個檔案的遊戲視窗崩潰（7A：`melee.e2e`「Target crashed」；7B：`harvest.e2e` 啟動時視窗關閉）；單獨重跑都通過。`combat.e2e` 的 Q 技能偶爾沒施放（傳送後立刻按鍵），任務 7C 改為等動作結束後按住 60 ms，連跑 3 次通過。當時電腦可用記憶體約 1 GB（16 GB 機器、其他程式佔用），推測是記憶體壓力；需要在空閒機器上連跑確認，並量測大地圖的記憶體（`PERF.md`）。
- 觀景點書籤在濃霧（迷霧 1.0）時幾乎全灰：攝影機離地面約 90 m，超過濃霧可見距離 75 m。與「濃霧」設定一致，但無法拿來做美術比對；是否要讓濃霧時遠處仍看得到輪廓，待使用者決定。
- 樹木與岩石是 KayKit Hexagon 的小模型放大使用，造型偏簡單；風格判定若不足，可換 KayKit Forest Nature Pack（itch.io，需手動下載）或其他 CC0 素材。
- 地形顏色是 shader 程式產生，不是手繪貼圖（T-24）；確定畫風後可改為取樣手繪貼圖。
- 互動已有開箱與採集；對話、修橋於 Phase 3。
- 存檔只有一個欄位（slot1）；多欄位選擇不在規格內，需要時再加。
- 教學提示文字（例如「左前方的草地上有一個寶箱」）以出生點為準，玩家走遠後方位描述不再準確。
- 滑鼠鎖定只在視窗位於作業系統前景時可用，自動測試時若有人在用電腦會略過該項（T-32）；人工試玩不受影響。
- JS bundle 約 3.8 MB（含 Rapier WASM），冷啟動 1.3 s，桌面版可接受。

## 重要決策
見 [DECISIONS.md](./DECISIONS.md)。
