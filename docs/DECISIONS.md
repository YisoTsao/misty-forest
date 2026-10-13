# 決策紀錄

## 採用規格書的預設建議（mistwood_dev_spec_final.md 0.3）
| 編號 | 決策 | 狀態 |
|---|---|---|
| D-01 | Q 版比例，使用者已確認；採 KayKit Adventurers（骨架與動畫同源，動畫驗證已通過） | **已確認**（2026-10-12） |
| D-02 | 參考硬體依規格第 7 節的 A／B 級 | 待使用者補上實際測試機 |
| D-03 | 先用 Kenney、Quaternius、Poly Pizza 素材 | 預設 |
| D-04 | Phase 5 前確認 Apple Developer 帳號 | 待確認 |
| D-05 | pnpm | 已採用 |
| D-06 | 音效用授權明確的素材庫 | 預設 |
| D-07 | 繁體中文，文字以 i18n key 管理 | 已採用 |

## 整合規格時的裁決
- **R-01 分區串流**：Phase 1 不實作。`Placement` 一律帶 `regionId`，`chunkId` 選填預留。Phase 1 量測超出預算才做。
- **R-02 存檔位置**：正式版由 Electron 主程序寫 `userData` 下的 JSON（原子寫入加 `.bak` 備份）。IndexedDB 只用在網頁開發模式。（Phase 2 實作）
- **R-03 迷霧**：權威狀態存三段（濃／淡／清 = 1.0／0.5／0.0），渲染層的 `uMist` 做時間與空間插值。

## 技術決策（任務 1A）
- **T-01 TypeScript 固定 6.0.x**：typescript-eslint 8.71 只支援 TS 6.1 以下，所以不升級 TS 7。等 typescript-eslint 支援後再升。
- **T-02 不使用 vite-plugin-electron**：主程序與 preload 用 esbuild 編譯（`scripts/build-electron.mjs`、`dev-electron.mjs`）。esbuild 本來就是 Vite 的依賴，不需要額外套件。preload 在 sandbox 下必須是 CommonJS，所以輸出成 `.cjs`。
- **T-03 效能面板自製**：沒有用 r3f-perf（規格允許「r3f-perf 或 stats 面板」），因為 r3f-perf 對 R3F 9 和 React 19 的支援不確定。自製面板直接讀取 `gl.info`，以 250 ms 間隔寫入 DOM。
- **T-04 Tone mapping 用 Neutral**：R3F 預設的 ACES 會讓綠色變灰，不符合規格要求的高飽和卡通風格。
- **T-05 所有套件放在 devDependencies**：Renderer 已由 Vite 打包，主程序沒有執行期依賴，這樣打包時不會把 node_modules 放進 asar（從 128 MB 降到 1.3 MB）。之後主程序如果需要執行期套件，再放進 `dependencies`。
- **T-06 新增 zod 依賴**：在技術棧清單內，用於資料與存檔驗證。
## 技術決策（任務 1B）
- **T-08 玩家角色 = KayKit Adventurers「Rogue_Hooded」**：CC0、GLB 內含 76 個與骨架同源的動畫，涵蓋規格 4.6 全部需求，免去 Mixamo 套 Q 版的變形風險；兜帽造型符合「迷路的旅人」。原始比例約 2 頭身（頭身比與規格「約 3 頭身」相近，使用者已同意），縮放 0.72 → 身高約 1.6 m。同系列另有 Knight / Mage / Barbarian / Rogue，可作為 NPC。
- **T-09 Physics `timeStep="vary"`**：角色控制器在 useFrame 計算位移，每幀對應一次物理步進；固定步長在 120 Hz 螢幕上會讓兩次 `setNextKinematicTranslation` 只生效一次。
- **T-10 角色外觀與剛體分離**：外觀依本幀計算的位置擺放（不等物理步進後的剛體同步），攝影機也讀同一份位置，避免一幀落差造成抖動。
- **T-11 移動規則放在 game-core**：`stepLocomotion` 為純函式（狀態 + 輸入 → 新狀態 + 位移），Rapier 只做碰撞修正；日後伺服器可重用同一份規則驗證移動。
- **T-12 測試的 TypeScript 設定分離**：`tsconfig.json`（App，不含 Node 型別）與 `tsconfig.test.json`（測試，含 Node 型別），避免 App 程式誤用 Node API。
- **T-13 端對端以 Node 腳本 + Playwright `_electron` 撰寫**（`e2e/*.e2e.mjs`），不引入 `@playwright/test` 執行器；需要時再評估。

- **T-07 佔位 GLB 由程式產生**：還沒有確定授權素材前，先用無外部依賴的腳本產生松樹 GLB，用來驗證 GLB 載入與 instancing 流程。（1C 已換成正式素材並移除）

## 技術決策（任務 1C）
- **T-14 環境素材 = KayKit Medieval Hexagon + Dungeon Remastered**：與角色同作者、同風格、CC0，可直接從 GitHub 取得。KayKit Forest Nature Pack 只在 itch.io 提供，無法以腳本下載，因此先用 Hexagon 包內的樹與岩石；Phase 1 風格判定後再決定是否替換。
- **T-15 碰撞形狀寫在 prefab，碰撞體以命令式 API 管理**：大量靜態物件不建立 React 元件，`EnvironmentColliders` 依玩家距離直接呼叫 `world.createCollider / removeCollider`（30 m 啟用、35 m 移除、每 0.25 秒更新），避免每次增減都觸發 React 重新渲染。
- **T-16 互動用空間格網查詢，不用 Rapier sensor**：互動對象數量多且全為靜態，格網查詢（`SpatialGrid`）是純 TS，可在 game-core 測試、日後伺服器重用；規格 6.2 允許「sensor 或空間查詢」。
- **T-17 互動規則先以最小指令 / 事件實作**：`handleInteract`（純函式）→ `WorldEvent[]` → `applyWorldEvents`，由 `worldStore` 呼叫。Phase 2 再包成完整的 `Authority` 介面，規則不需改動。
- **T-18 安全點採「沿途記錄」**：不在資料中手動標記安全點；記錄玩家實際站穩過的位置，保證重置點可站立、不在碰撞體內。
- **T-19 `uMist` 以材質 `onBeforeCompile` 實作去飽和**：尚未引入後處理（Phase 1 收尾才做），先在每個 toon 材質的霧計算前插入去飽和與冷色偏移；所有材質共用同一個 uniform 物件。後處理加入後，可把畫面整體色調移到 color grading，材質層保留植被去飽和。
- **T-20 迷霧可見距離以幾何插值**：線性插值時前半段幾乎看不出變化；幾何插值讓滑桿每一段的體感變化較平均。濃霧的可見距離 75 m（46 m 時觀景點整片灰，無法做美術比對）。

## 修正與 Phase 1 收尾（2026-10-13）
- **T-21 Rapier 物件在 effect 內建立、cleanup 釋放**：開發模式的 React StrictMode 會「掛載 → 卸載 → 再掛載」。角色控制器原本用 `useMemo` 建立、cleanup 釋放，再掛載時拿到已釋放的控制器，每幀拋錯，畫面停住（使用者回報「轉視角後畫面不動」）。正式版沒有 StrictMode，原本的端對端測試都跑正式版所以沒抓到。改為在 effect 內建立；新增 `e2e/dev.e2e.mjs` 以開發模式實際操作，任何未捕捉錯誤都會失敗。之後所有 WASM / GPU 資源都依此模式。
- **T-22 未捕捉錯誤顯示在畫面上**：`window` 的 `error` / `unhandledrejection` 寫入 `errorStore`，由 `ErrorOverlay` 顯示，避免遊戲無聲凍結。
- **T-23 村莊用 KayKit Medieval Hexagon 的建築與雜物**：與樹木同一包、共用同一張貼圖，風格一致。碰撞形狀新增 `offset`（模型幾何不在原點時使用，例如柵欄位於六角地塊邊緣）。村莊周圍地形壓平（`VILLAGE_CENTER`、`VILLAGE_RADIUS`）。
- **T-24 地形 splat 在 shader 內以程式產生，不用貼圖**：規格 4.2 寫「splat map + 手繪貼圖」。目前沒有參考圖與手繪貼圖素材，所以先以世界座標雜訊產生「筆刷感」色塊、泥土路（邊緣擾動、碎石）與陡坡岩石，權重來自頂點屬性（到小路的距離）與法線。好處是任何距離都沒有貼圖拉伸、不需載入資產；使用者確定畫風後，可把同一套權重改成取樣手繪貼圖。
- **T-25 草花：16 m 區塊的 InstancedMesh + shader 風動與距離縮入**：草叢顏色在 vertex shader 取自與地形相同的函式，根部與地面無縫；法線一律朝上（雙面材質背面不會變黑）；超過可見距離時整株縮入地面，不用半透明排序。散佈為 game-core 純函式（抖動格點、固定種子、避開小路與碰撞體），有單元測試。
- **T-26 遠山用程式產生的環狀山脈，不用 KayKit 山模型**：Hexagon 包的山是六角柱狀岩壁，放大當背景時像灰色牆面（已截圖確認後放棄）。改為兩層環狀帶狀網格（近層綠色丘陵、遠層藍紫山峰），以「空氣透視」混向地平線色而非場景霧，混合比例跟隨 `uMist`。地圖外加一圈低於邊緣丘陵的地面延伸，從觀景點往外看不會有空洞。雲用 KayKit 雲模型，緩慢飄移。
- **T-27 陰影相機跟隨攝影機前方焦點**：原本單一陰影貼圖覆蓋 140×140 m，近景鋸齒與樹冠陰影條紋（shadow acne）明顯。改為只涵蓋攝影機前方 ±38 m，焦點對齊陰影貼圖像素格避免移動時閃爍；normalBias 0.09。
- **T-28 新增 `@react-three/postprocessing` 3.2.0、`postprocessing` 6.39.5**：規格技術棧已列；版本確認支援 R3F 9 與 three 0.186。Bloom（低強度、高門檻）、飽和度（晴朗 +0.1 → 迷霧 −0.2，跟隨 `uMist`）、暗角、Neutral tone mapping；composer 開 4× MSAA。低畫質不啟用。
- **T-29 畫質三級的數值放在 game-core**（`settings/quality.ts`）：草花密度與距離、後處理、陰影解析度、像素比上限。Phase 1 設定不存檔（Phase 2 與存檔系統一起做）；`?quality=low|medium|high` 可指定初始畫質。
- **T-30 Phase 1 先做最小主選單與暫停選單**：Phase 1 驗收要求「可連續遊玩並回主選單」。主選單（開始遊戲、畫質、離開遊戲）以緩慢環繞的實際場景為背景；遊玩中按 Esc 或滑鼠鎖定被解除時開啟暫停選單（繼續、畫質、回主選單）。流程狀態轉換為 game-core 純函式。還沒有存檔，所以回主選單再開始會重置世界與角色（選單上有提示）。`?play=1` 略過主選單（測試與截圖用）。
- **T-31 關閉視窗即結束程式（含 macOS）**：遊戲只有一個視窗，沿用 macOS 文件型 App「關窗不結束」的慣例沒有意義，也會讓主選單的「離開遊戲」看起來沒反應。
- **T-32 滑鼠鎖定的端對端檢查依環境略過**：Chromium 只在視窗位於作業系統前景時允許滑鼠鎖定；開發機有人使用其他視窗時，連最小測試頁都會被拒絕（`WrongDocumentError`，已驗證）。此時 `dev.e2e` 會把「鎖定滑鼠」標為略過並說明原因，改用除錯 API 以相同換算轉動攝影機，其餘流程照常驗證。
