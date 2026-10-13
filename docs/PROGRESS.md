# 開發進度

## 目前階段
Phase 3（戰鬥、NPC 與任務）。**任務 3A–3E 已完成**（各區域迷霧、NPC 與對話、任務系統、湖泊與木橋、戰鬥與迷霧生物）；下一個是任務 3F（星光夥伴），之後做 Phase 3 驗收。Phase 2 已通過驗收（見下方）。
Phase 1 已依使用者指示視為通過（DECISIONS P-01）；風格參考圖比對與 B 級機器量測仍待使用者，見「待使用者處理」。

**續作從這裡開始**：讀完本檔「下一步」與「已知問題」。

**環境注意**：這台機器的 `pnpm` 預設會用到 Node 12（`~/Library/pnpm/node`），執行前先 `export PATH=~/.nvm/versions/node/v24.13.0/bin:$PATH`。若 `pnpm test` 出現 rolldown「Cannot find native binding」，執行 `pnpm install --force`。

## 在另一台電腦續作
1. `git clone https://github.com/YisoTsao/misty-forest.git && cd misty-forest`
2. 需要 Node 24、pnpm 12（`corepack enable` 或 `npm i -g pnpm`）。`pnpm install`（會下載 Electron 執行檔；`pnpm-workspace.yaml` 已允許 electron / esbuild 的 install script）。
3. 確認環境：`pnpm typecheck && pnpm lint && pnpm test`，再 `pnpm e2e`（會開 Electron 視窗，執行時不要操作電腦）。
4. 試玩：`pnpm dev:electron`。
5. 未納入版本控制、需要時重新產生：`node_modules/`、`dist/`、`dist-electron/`、`release/`（`pnpm build`、`pnpm run pack`）。
6. AI 續作需要的文件：`CLAUDE.md`、`mistwood_dev_spec_final.md`（已整合原始需求與技術規範，優先依此）、本檔、`DECISIONS.md`。原始需求 `mistwood_game_spec.md` 與 skill `r3f-game-dev-spec` 不在 repo 內；最終規格書已涵蓋其內容。
7. Windows 機器：腳本皆為 Node，應可直接執行；`window-all-closed` 已會結束程式。效能數字請以 `node scripts/perf.mjs` 另外記錄到 `PERF.md`（可順便作為 B 級機器量測）。

## 已完成
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

## 下一步：Phase 3（戰鬥、NPC 與任務，規格 6.4–6.6、9）
依序、單次一個可驗收功能：
1. **任務 3F 星光夥伴**：解鎖旗標存檔、跟隨玩家。
2. **Phase 3 驗收**：可擊敗敵人；任務可接 / 完成、獎勵正確；任務與 `mistStage` 可存讀；完成清除任務後森林外觀明顯變亮。

## 待使用者處理（不阻擋開發）
1. **風格判定（規格 4.8）**：把參考圖放進 `docs/art/reference/`，與 `docs/screenshots/phase1/`、`phase2/` 並排比對。
2. **B 級機器量測**：在 M1 / Iris Xe 8 GB 等級的機器執行 `node scripts/perf.mjs`，補進 `PERF.md`。

## 已知問題
- 觀景點書籤在濃霧（迷霧 1.0）時幾乎全灰：攝影機離地面約 90 m，超過濃霧可見距離 75 m。與「濃霧」設定一致，但無法拿來做美術比對；是否要讓濃霧時遠處仍看得到輪廓，待使用者決定。
- 樹木與岩石是 KayKit Hexagon 的小模型放大使用，造型偏簡單；風格判定若不足，可換 KayKit Forest Nature Pack（itch.io，需手動下載）或其他 CC0 素材。
- 地形顏色是 shader 程式產生，不是手繪貼圖（T-24）；確定畫風後可改為取樣手繪貼圖。
- 風車的扇葉目前不會轉（與建築一起以 InstancedMesh 批次渲染）。
- 互動已有開箱與採集；對話、修橋於 Phase 3。
- 存檔只有一個欄位（slot1）；多欄位選擇不在規格內，需要時再加。
- 揮砍與攻擊時角色手上沒有武器（角色模型的武器掛件都隱藏了）；之後可在動作期間顯示短刀。
- 教學提示文字（例如「左前方的草地上有一個寶箱」）以出生點為準，玩家走遠後方位描述不再準確。
- 滑鼠鎖定只在視窗位於作業系統前景時可用，自動測試時若有人在用電腦會略過該項（T-32）；人工試玩不受影響。
- JS bundle 約 3.8 MB（含 Rapier WASM），冷啟動 1.3 s，桌面版可接受。

## 重要決策
見 [DECISIONS.md](./DECISIONS.md)。
