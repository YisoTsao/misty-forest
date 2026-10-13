# 開發進度

## 目前階段
Phase 2（探索、互動與存檔框架）。**任務 2A（Authority、物品、背包、採集）已完成**；下一個是任務 2B（背包介面）。
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

## 下一步（Phase 2 其餘任務，依序）
1. **任務 2B 背包介面**：I / Tab 開關、格子、圖示、數量、說明提示；開啟時釋放滑鼠、角色停止。
2. **任務 2C 存檔框架**（規格 6.8）：`SaveStorage`（Electron 主程序 JSON：原子寫入、`.bak`；網頁開發模式 IndexedDB）、`version` + 遷移 + zod、損壞時嘗試備份 → 仍失敗則提示並允許新遊戲；自動存檔（定時、採集 / 開箱後）、手動存檔、匯出；主選單「繼續 / 新遊戲」；設定值（畫質）存檔。
3. **任務 2D 教學引導與設定**：出生草原內完成移動、互動、採集的引導；設定畫面（畫質、按鍵重新配置）。
4. Phase 2 驗收後進入 Phase 3（戰鬥、NPC 與任務）。

## 待使用者處理（不阻擋開發）
1. **風格判定（規格 4.8）**：把參考圖放進 `docs/art/reference/`，與 `docs/screenshots/phase1/`、`phase2/` 並排比對。
2. **B 級機器量測**：在 M1 / Iris Xe 8 GB 等級的機器執行 `node scripts/perf.mjs`，補進 `PERF.md`。

## 已知問題
- 觀景點書籤在濃霧（迷霧 1.0）時幾乎全灰：攝影機離地面約 90 m，超過濃霧可見距離 75 m。與「濃霧」設定一致，但無法拿來做美術比對；是否要讓濃霧時遠處仍看得到輪廓，待使用者決定。
- 樹木與岩石是 KayKit Hexagon 的小模型放大使用，造型偏簡單；風格判定若不足，可換 KayKit Forest Nature Pack（itch.io，需手動下載）或其他 CC0 素材。
- 地形顏色是 shader 程式產生，不是手繪貼圖（T-24）；確定畫風後可改為取樣手繪貼圖。
- 風車的扇葉目前不會轉（與建築一起以 InstancedMesh 批次渲染）。
- 互動已有開箱與採集；對話、修橋於 Phase 3。世界狀態、背包與畫質設定尚未存檔（任務 2C）。
- 揮砍動作時角色手上沒有斧頭（角色模型的武器掛件都隱藏了）；Phase 3 加入戰鬥武器時一起處理。
- 迷霧全地圖同一值；區域間空間混合等第二個區域加入時實作。
- 滑鼠鎖定只在視窗位於作業系統前景時可用，自動測試時若有人在用電腦會略過該項（T-32）；人工試玩不受影響。
- JS bundle 約 3.8 MB（含 Rapier WASM），冷啟動 1.3 s，桌面版可接受。

## 重要決策
見 [DECISIONS.md](./DECISIONS.md)。
