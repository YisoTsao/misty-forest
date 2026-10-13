# 《迷霧之森：星光旅人》最終開發規格書（Mistwood Final Development Spec）

| 項目 | 內容 |
|---|---|
| 文件版本 | 2.0（整合版） |
| 來源 | `mistwood_game_spec.md` v1.1（做什麼）＋ skill `r3f-game-dev-spec` v2（怎麼做） |
| 專案代號 | Mistwood（世界：晨曦谷地 Dawn Valley） |
| 類型 | 3D 可愛風格開放世界冒險遊戲（先單人，後選配多人） |
| 平台 | Windows、macOS 桌面（Electron） |
| 開發方式 | AI Coding 輔助，單次只做一個可驗收功能 |

---

## 0. 比對結論

### 0.1 一致項（直接採用）
- 世界、玩法、章節、階段 0–6、優先級與砍功能順序以規格書為準。
- 技術棧：TypeScript strict、Vite（不用 Next.js）、React + Tailwind、Zustand + XState、zod、R3F + drei + postprocessing + Rapier、Electron + electron-builder、Vitest + Playwright、pnpm。
- 單人不依賴伺服器；規則層純邏輯、可日後在伺服器重用（Authority 介面）。
- 存檔：版本號、驗證、原子寫入、備份、匯出、損壞可啟動。
- 迷霧：每區域 `mistLevel`、持久化、由任務與擊殺改變。
- 效能數字以規格書 8.2 為準；skill 只提供做法。
- 兩份文件的物件矩陣、AI 工作流程、`DECISIONS/PERF/ASSETS/PROGRESS.md` 要求相容。

### 0.2 差異與裁決
| # | 差異 | 裁決 |
|---|---|---|
| 1 | 規格書 4.1「單一地圖」；skill 8「串流載入只在量測超出預算時才做，但資料預留 `regionId/chunkId`」 | 採 skill：Phase 1 不做 chunk 串流；`Placement` 從第一天含 `regionId`，`chunkId` 選填預留。Phase 1 量測超標才實作串流（記入 `DECISIONS.md`）。 |
| 2 | 規格書 6.8 寫「提供匯出與備份」，未指定儲存位置；skill 4.1 指定 Electron 主程序寫 JSON、網頁開發模式用 IndexedDB | 採 skill：正式版存於 `userData` JSON（原子寫入 + `.bak`）；IndexedDB 僅供純網頁開發模式，同一 `SaveStorage` 介面。 |
| 3 | 規格書 4.3「每區 3 段（濃/淡/清）」；skill 5.6 為連續 `uMist` uniform 並做空間平滑混合 | 相容：權威狀態存離散 3 段，對應 `mistLevel` ≈ 1.0 / 0.5 / 0.0；渲染層以 `uMist` 對時間與空間做插值。 |
| 4 | 規格書 4.2 未列農田；skill 矩陣有農田/作物（P2） | 農田列 **P2（選配）**，不進 P0。 |
| 5 | 規格書未提「合成」；skill v2 也未列 | 不新增合成系統。建造只做「材料檢查與扣除」。 |
| 6 | skill 矩陣：木橋修復任務中可互動、持久化＝是（規格書僅有「橋樑修復任務」） | 採 skill：橋有「損毀／修復」兩種狀態並持久化。 |
| 7 | 夥伴：規格書只要跟隨與待機；skill：持久化是、位置不持久化 | 持久化「已解鎖」旗標即可；不做自主 AI。 |
| 8 | skill 對規格書檔名寫 `Mistwood-game-spec.md`，實際為 `mistwood_game_spec.md` | 以實際檔名為準；建議專案指示檔使用實際檔名。 |
| 9 | 規格書 8.2 draw call/三角面為 A/B 兩級；skill 無數字 | 照規格書，無衝突。 |

> 無需使用者額外裁決的真正衝突；以上第 1、2 項為最需注意的取捨，已寫入 `docs/DECISIONS.md` 初始條目。

### 0.3 待決事項（採預設，記錄於 `DECISIONS.md`）
D-01 約 3 頭身、骨架相容角色；D-02 使用者補實際測試機；D-03 先用 Kenney/Quaternius/Poly Pizza；D-04 Phase 5 前確認 Apple Developer 帳號；D-05 pnpm；D-06 授權明確音效庫；D-07 繁體中文＋i18n key。

---

## 1. 產品定義

### 1.1 願景
精緻可愛風格的 3D 開放世界冒險：在森林、山脈、湖泊、草原與村莊間探索、採集、對話、任務、戰鬥、建造家園。要有探索感與生命力，不是展示場景。

### 1.2 非目標（第一版）
無限無縫世界、MMO、玩家交易、語音社交、AI 即時生成世界、基本玩法前追求高階渲染。

### 1.3 故事與章節
星源古樹光芒消失、迷霧擴散。玩家為迷路旅人，與星光夥伴同行。第一版做序章與第一章局部：序章「迷路的旅人」→第一章「重新點亮村莊」；二至四章僅大綱。

### 1.4 迷霧機制（核心賣點）
- 每個 `regionId` 有權威狀態 `mistStage ∈ {thick, thin, clear}`，對應 `mistLevel` 1.0 / 0.5 / 0.0。
- 任務完成、擊殺迷霧生物、點亮村莊節點會降低階段；持久化。
- 影響：霧密度/色、去飽和與色溫、植被與地形材質、可見距離與光強、迷霧生物生成率（由 game-core 決定）。

---

## 2. 技術棧與依賴

| 領域 | 選用 |
|---|---|
| 語言 / 打包 | TypeScript strict / Vite（禁止 Next.js） |
| UI | React + Tailwind CSS |
| 狀態 | Zustand（一般）、XState（任務、對話、AI） |
| 驗證 | zod（存檔與資料檔） |
| 3D | React Three Fiber、Three.js、drei、@react-three/postprocessing |
| 物理 | @react-three/rapier |
| 桌面 | Electron、electron-builder |
| 多人（Phase 6） | Node.js + Socket.IO |
| 測試 / 品質 | Vitest、Playwright（Electron）、ESLint、`tsc --noEmit` |
| 效能 | r3f-perf 或 stats 面板 |
| 美術工具 | Blender、gltf-transform / gltfpack |
| 套件管理 | pnpm |

新增依賴前，先在 `docs/DECISIONS.md` 記錄理由與替代方案。

### 2.1 目錄結構
```
src/
  game-core/   # 純 TS：型別、規則、指令處理、事件、存檔 schema（零渲染依賴）
  game/        # stores、systems、資料載入、Authority 實作
  world/       # R3F：地形、植被、props、天空、實體元件
  render/      # shader、材質、後處理
  ui/          # React UI
  net/         # Socket.IO client（Phase 6）
  data/        # items / quests / dialogues / prefabs / placements / i18n
electron/      # main.ts、preload.ts、存檔 IPC
server/        # 多人伺服器（Phase 6）
docs/          # DECISIONS、PERF、ASSETS、PROGRESS、art/reference/、screenshots/
scripts/       # 截圖腳本、資產處理
```
僅 `game-core` 從第一天獨立；其餘不提前拆套件。

### 2.2 Electron 安全
`contextIsolation` 開、`nodeIntegration` 關；Renderer 僅透過 preload 的最小 IPC（存檔讀寫/匯出）；不載入不受信任的遠端程式碼；不放秘密金鑰於前端。

---

## 3. 架構規範

1. 關注點分離：渲染、邏輯、UI、資料存取分屬不同模組。
2. **`game-core` 不得 import React、Three.js、Rapier、Electron**（ESLint `no-restricted-imports` 強制）。
3. 單一資料來源：UI 與 3D 只透過 selector 讀 store。
4. `useFrame` 內只操作 ref/store，**不得 `setState`**；重用向量與矩陣。
5. 場景模組化（Terrain、Vegetation、Props、NPCs、Enemies、Sky、Effects），禁止單一巨大元件。
6. 資料驅動：物件、NPC、物品、任務、對話、掉落表皆為資料檔。
7. 本機暫態（輸入預測、攝影機、特效）與權威狀態（物品、血量、任務、世界物件、`mistStage`）分離。
8. 資源生命週期：geometry/material/texture 的載入、快取、釋放明確管理。
9. UI 文字一律 i18n key。

### 3.1 資料四層
```ts
type Prefab = {                    // 1. 是什麼（資料檔）
  id: string; model: string;
  collider: 'none' | 'static' | 'sensor' | 'dynamic';
  interaction?: 'harvest' | 'open' | 'talk' | 'enter' | 'read' | 'build';
  harvest?: { lootTableId: string; respawnSec?: number };
  persists: boolean;
};
type Placement = {                 // 2. 放在哪（資料檔）
  id: string;                      // 全域唯一，存檔鍵
  prefabId: string; regionId: string; chunkId?: string;
  position: [number, number, number];
  rotation?: [number, number, number]; scale?: [number, number, number];
};
type ObjectRuntime = {             // 3. 執行期（記憶體，game-core 管理）
  placementId: string; harvested?: boolean; respawnAt?: number; hp?: number; open?: boolean;
};
type SaveObjectDelta =             // 4. 存檔：只存與預設不同者
  { placementId: string } & Partial<Pick<ObjectRuntime, 'harvested'|'respawnAt'|'hp'|'open'>>;
```
靜態定義不得混入執行期狀態與存檔格式。

### 3.2 指令 → 權威層 → 事件
```
UI / 輸入 / R3F ──Command──▶ Authority ──Event[]──▶ stores ──selector──▶ UI / 3D
```
- `Authority` 為介面：單人 `LocalAuthority`（同行程），Phase 6 加 `RemoteAuthority`。
- 指令：`HarvestObject`、`OpenChest`、`AcceptQuest`、`TurnInQuest`、`Attack`、`PlaceBuilding`、`RepairBridge`…
- 指令處理為純函式（狀態 + 指令 → 事件），以 Vitest 測試。
- 玩家位置為本機暫態，需要時才送出。

---

## 4. 美術與渲染規格

### 4.1 風格基準
以 `docs/art/reference/` 參考圖為準：明亮、飽和、手繪卡通；圓潤清晰造型；前中遠景分明。禁用未加工基本幾何作最終美術、禁止風格差異過大的模型直接混用、寫實與卡通混搭。

### 4.2 材質與光照
- 角色/建築：toon（2–3 階 ramp 或 gradient map）。
- 地形：splat map（草、泥土路、岩石），手繪低對比貼圖。
- 一盞方向光＋半球光；只有主光投影、限制陰影距離；暖色主光、偏藍環境光。

### 4.3 植被與環境
- 樹：alpha card 疊層、InstancedMesh、近遠細節分級。
- 草花：instanced 面片＋風動 vertex shader（根部固定），依距離淡出/降密度。
- 岩石灌木：低面數＋instancing。
- 天空：gradient dome / skybox，雲層 billboard 緩動；**遠山為 backdrop**（不納入物理與載入）；深度霧與天空色融合。
- 環境動畫：葉草擺動、水面波紋、炊煙、雲移動。
- 生活感細節：泥土小路、羊群、曬衣繩、木桶、木箱、柵欄、路標、野花。

### 4.4 後處理與畫質
Bloom（輕）、color grading / tone mapping；選配輕度 SSAO、vignette。畫質三級（低/中/高），低畫質可關後處理並降植被密度。

### 4.5 晴朗／迷霧外觀（`uMist`）
單一 uniform 組驅動，不做兩套場景：

| 參數 | 晴朗（0.0） | 迷霧（1.0） |
|---|---|---|
| 霧 | 淡、與天空同色 | 濃、冷灰 |
| 飽和度 / 色溫 | 高 / 暖 | 低 / 偏冷 |
| 植被地形材質 | 原色 | 去飽和偏冷 |
| 可見距離 / 光強 | 遠 / 強 | 近 / 平淡 |

區域邊界以空間位置平滑混合。Phase 1 用除錯滑桿；Phase 3 才接任務。迷霧生物生成率由 game-core 決定。

### 4.6 角色與動畫
- 比例依 D-01（約 3 頭身）。**Mixamo 標準人形骨架直接套用 Q 版比例常變形**：選骨架相容模型、Blender 重新綁定，或自製簡化動畫集。
- 動畫：Idle、Walk、Run、Jump、Fall、Land、Attack、Hit、Interact；依狀態切換，不得同時播放走路與待機，停止後不得滑行。
- 夥伴與動物使用簡單骨架或 morph target。
- **Phase 0 動畫來源驗證為進入 Phase 1 的閘門。**

### 4.7 資產規範
GLB/glTF；每個資產登錄 `ASSETS.md`（名稱、來源、授權、商業使用限制、修改再散布限制、用途）；未確認授權不得進入發行版。管線：Blender 統一比例/原點/面向/命名 → gltf-transform/gltfpack 壓縮（KTX2、Draco/Meshopt）→ `gltfjsx` 或資料驅動載入。

### 4.8 美術驗收（每階段適用）
1. 4 個攝影機書籤（出生草原、村莊、森林、觀景點）× 晴朗/迷霧，與參考圖並排，由使用者做最終風格判定。
2. 無基本方塊/球體/膠囊當最終美術。
3. 角色、環境、建築、道具視覺語言一致。
4. 實際執行畫面驗證，不以概念圖代替。
5. 無粉紅材質、遺失貼圖、比例異常。

---

## 5. 世界規格

### 5.1 區域與優先級
| 區域 | 優先級 | 用途 |
|---|---|---|
| 出生草原 | P0 | 出生點、教學 |
| 小型村莊 | P0 | NPC 與任務中心、可進入建築 |
| 森林探索區 | P0 | 採集、迷霧生物 |
| 湖泊與木橋 | P0 | 橋樑修復任務 |
| 玩家家園基地 | P0 | 建造場地 |
| 山丘與觀景點 | P1 | 俯瞰、遠山視野、美術驗收點 |
| 遺跡／洞穴入口 | P2 | 迷你 Boss／區域切換 |

第一版為單一可探索地圖；室內與洞穴使用子場景＋傳送點，不與開放世界混用。每個 `Placement` 帶 `regionId`。**串流載入僅在 Phase 1 量測超出預算時才實作**（資料層已預留 `chunkId`）。

### 5.2 世界物件屬性矩陣
| 物件 | 碰撞 | 互動 | 採集 | 持久化 | 備註 |
|---|---|---|---|---|---|
| 樹木 | 是 | 是 | 是 | 是 | InstancedMesh；砍後隱藏 instance 並記重生 |
| 岩石 | 是 | 是 | 是 | 是 | 固定剛體 |
| 花朵 | 否 | 是 | 是 | 是 | 不擋路 |
| 可採集植物 | 否 | 是 | 是 | 是 | 重生計時存狀態 |
| 寶箱 | 是 | 是 | 否 | 是 | 記開關與內容；唯一獎勵不可重複領 |
| 木橋 | 是 | 修復任務中為是 | 否 | 是 | 損毀／修復兩狀態 |
| 門與入口 | 是 | 是 | 否 | 是 | 開關或場景切換 |
| 可進入建築 | 是 | 是 | 否 | 是 | 內部為子場景，傳送點連接 |
| NPC | 是 | 是 | 否 | 否 | 對話與任務狀態 |
| 敵人（迷霧生物） | 是 | 是（戰鬥） | 否 | 是 | 剛體＋AI 狀態機 |
| 環境動物（羊） | 簡化 | 選配 | 選配 | 否 | 漫遊/休息；遠離玩家降頻或暫停 |
| 星光夥伴 | 否 | 是 | 否 | 是（解鎖旗標） | 跟隨玩家，位置不持久化 |
| 農田／作物 | 否 | 是 | 是 | 是 | **P2 選配** |
| 路標／告示牌 | 是 | 是 | 否 | 否 | 顯示文字 |
| 建造位置／已放置物 | 選配 | 是 | 否 | 是 | 存位置與旋轉 |
| 傳送／區域切換點 | Sensor | 是 | 否 | 否 | 觸發地圖或位置更新 |

---

## 6. 系統規格

### 6.1 角色控制與攝影機
- 按鍵：WASD 移動、滑鼠視角、Space 跳、Shift 跑、E 互動、左鍵攻擊、Q 技能、I/Tab 背包、Esc 暫停；全部可重配，輸入層與邏輯解耦；手把 P1。
- Rapier kinematic character controller（或膠囊 body）：坡度、台階、跳躍、落地；斜向不快於直線；方向依攝影機水平朝向。
- 掉出地圖→重置至最近安全點，不得卡死。
- 攝影機：滑鼠旋轉、平滑跟隨、限制垂直角度、**以 shape cast 做碰撞避讓（被擋拉近）**；UI 開啟時釋放滑鼠。

### 6.2 互動與採集
流程：靠近 → 提示 → E → 指令 → 事件 → 更新世界與 UI → 必要時自動存檔。以 sensor 或空間查詢選最合適目標，**不每幀對所有物件做射線**。資源：木材、石頭、花朵、草藥、星光碎片；有數量、條件、重生與持久化規則。

### 6.3 背包與物品
物品定義（`items.json`）與玩家背包分離；格子制、堆疊上限、取得/消耗、材料檢查、圖示與提示。

### 6.4 NPC 與對話
節點式資料（id、說話者、文字 key、選項、條件、效果）；支援多段、選項、任務接取與回報、待機與簡單移動。

### 6.5 任務
Locked / Available / Active / Completed（Failed 視需要）；XState 或狀態表，經指令與事件觸發，不耦合 3D 元件。第一版三個任務，其中第一個拆三子任務：
1. 收集木材（採集 → 回報）
2. 幫助村民修復木橋（取得材料 → 修復橋 → 回報）
3. 清除森林迷霧生物（擊敗 N 隻 → 回報；降低森林 `mistStage`）

### 6.6 戰鬥
一種主要攻擊、一種特殊技能、一種敵人（迷霧生物）。命中由 sensor/shape cast＋遊戲邏輯判定，不依賴動畫事件；冷卻、傷害數字、擊退、死亡與重生、戰鬥獎勵。敵人 AI 狀態機：待機、巡邏、追擊、攻擊、返回、死亡；依距離降頻，超出範圍暫停。

### 6.7 建造
營火、簡單家具、裝飾物；網格吸附、預覽幽靈物件（可/不可放置有明確顯示）、檢查坡度與碰撞、**確認後才扣材料**；已放置物以資料列表保存（類型、位置、旋轉）。不做施工模擬與地形編輯。

### 6.8 存檔
```ts
interface SaveStorage {
  list(): Promise<SaveMeta[]>;
  read(slot: string): Promise<unknown>;
  write(slot: string, data: unknown): Promise<void>;
  export(slot: string): Promise<Blob>;
}
```
- Electron：主程序寫 `app.getPath('userData')` 下 JSON，經 IPC；網頁開發模式：IndexedDB 轉接器（同介面）；設定值同機制。
- **原子寫入**（暫存檔→改名）、**滾動備份**（`.bak`）、`version` ＋遷移函式（含測試）、讀取以 zod 驗證，失敗→嘗試備份→仍失敗則提示並允許新遊戲，不得白畫面。
- 非阻塞（非同步 IPC）；自動存檔時機：區域切換、任務完成、定時；另有手動存檔與匯出。
- 內容：玩家位置與屬性、背包、任務進度、世界物件差異（第 4 層）、建造物件、各區域 `mistStage`、已解鎖區域、時間、設定值。

### 6.9 其他必要系統
| 系統 | 需求 | 優先級 |
|---|---|---|
| 主選單與設定 | 新遊戲、繼續、設定（畫質/音量/按鍵）、離開 | P0 |
| 暫停選單 | 繼續、設定、回主選單 | P0 |
| 教學引導 | 出生草原內完成移動、互動、採集 | P0 |
| 多語系 | 繁中，i18n key 管理 | P0（結構）/P2（其他語言） |
| 音效與音樂 | 環境音、腳步、互動、戰鬥、區域 BGM（晴朗/迷霧各版或濾波） | P1 |
| 手把 | 輸入層已解耦 | P1 |
| 日夜與雨 | — | P2 |

---

## 7. 效能預算與量測

| 項目 | A 級（高/中） | B 級（低） |
|---|---|---|
| 解析度 / 幀率 | 1080p / 60 FPS | 1080p / 30 FPS |
| 同畫面 draw calls | ≤ 400 | ≤ 250 |
| 同畫面三角面 | ≤ 1.5M | ≤ 600K |
| 冷啟動至主選單 | ≤ 10 s | ≤ 15 s |
| 載入存檔進世界 | ≤ 15 s | ≤ 25 s |
| 連續 30 分鐘 | 暖機後記憶體（含 GPU）成長 ≤ 10%，無持續上升 | 同左 |

- 參考機：A＝近五年中階桌機/遊戲筆電、獨顯、16 GB、SSD；B＝Apple M1 或 Iris Xe 等級、8 GB（D-02 由使用者補實機）。
- Phase 1 先量測並把結果寫入 `docs/PERF.md`、校正上表；每次驗收記錄機型、場景、畫質、數字。
- 手段：InstancedMesh / `<Instances>`、KTX2、Draco/Meshopt、LOD、視錐與距離剔除；樹碰撞用簡化圓柱/膠囊且只啟用玩家附近者；離開區域釋放資源。
- **先量測再最佳化**；不用無頭截圖幀率推斷效能。

---

## 8. 測試與驗證

| 類型 | 工具 | 範圍 |
|---|---|---|
| 型別 / lint | `tsc --noEmit`、ESLint | 每次變更，需歸零 |
| 邏輯 | Vitest | game-core：指令處理、任務、背包、建造檢查、迷霧、掉落 |
| 存檔 | Vitest | 原子寫入、損壞檔恢復、版本遷移 |
| 端對端 | Playwright（Electron） | 啟動、主選單、新遊戲、移動、採集、存讀檔 |
| 視覺 | `scripts/screenshot` | 攝影機書籤 × 迷霧等級 → `docs/screenshots/<階段>/` |
| 建置 | electron-builder | 桌面版可打包 |

視覺驗證：以 URL 參數或除錯指令（如 `?cam=village&mist=0`）切換書籤與迷霧；AI 檢視截圖檢查模型載入、粉紅材質、比例、色調；風格最終判定由使用者；無頭 WebGL 可能為軟體渲染，不可推斷效能。

---

## 9. 開發階段與驗收

規模：S 數日、M 1–2 週、L 3–5 週、XL ≥ 6 週（單人＋AI Coding，Phase 1 後校正）。

### Phase 0：專案骨架（S）
- Electron + Vite + React + TS strict + R3F；`game-core` 獨立並加 ESLint 限制；Zustand；載入場景與 GLB；開發/正式環境分離；`PROGRESS.md`、`DECISIONS.md`、`ASSETS.md`、專案指示檔、截圖腳本、FPS 面板。
- **驗收**：Electron 視窗載入場景與 GLB；可建置桌面版；截圖腳本可輸出指定書籤；**動畫來源驗證通過**（所選角色可套用動畫不變形）。

### Phase 1：風格驗證場景與可玩角色（L）
- 風格切片：一小塊草原達 4.8 標準，晴朗/迷霧可由除錯滑桿切換。
- 角色：移動、跑、跳、碰撞、攝影機（含避讓）、動畫切換。
- **驗收**：4.8 通過（兩種外觀）；角色不穿牆與地面；動畫切換正確；量測並校正第 7 節數字、寫入 `PERF.md`；決定是否需要串流載入；可連續遊玩並回主選單。

### Phase 2：探索、互動與存檔框架（M）
- Authority/指令/事件骨架、互動物件、採集、寶箱、背包、**存檔框架（`SaveStorage`、version、zod、原子寫入、備份、匯出）**、主選單與設定、教學引導、i18n 結構。
- **驗收**：資源取得正確；唯一獎勵不重複；UI 與世界狀態一致；重開遊戲後背包與採集狀態仍在；存檔損壞仍可啟動；存檔遷移測試通過。

### Phase 3：戰鬥、NPC 與任務（L）
- 迷霧生物、攻擊與技能、NPC 對話、三個任務、`mistStage`↔`uMist` 連動、星光夥伴（跟隨）。
- **驗收**：可擊敗敵人；任務可接/完成、獎勵正確；任務與 `mistStage` 可存讀；完成清除任務後森林外觀明顯變亮。

### Phase 4：建造與家園（M）
- **驗收**：可放置/旋轉/確認；無效位置不可放；材料不足不可建；重啟後仍在。

### Phase 5：美術、音效、效能完善與發行（L）
- 補齊 P0 區域美術與 P1（觀景點、音效、手把）、光影與環境效果、效能校正。
- 發行：Windows 安裝檔；macOS 簽章與公證（需 Apple Developer，D-04）；自動更新（選配）。
- **驗收**：第 7 節目標在 A/B 級達成並有紀錄；無明顯資源洩漏；4.8 在所有 P0 區域通過；安裝檔可在乾淨機器安裝執行。
- 完成後即為第一個可發行單人版本。

### Phase 6：多人連線（XL，可選）
- Socket.IO、`RemoteAuthority`、房間代碼、位置插值、共享世界狀態、斷線重連；伺服器驗證關鍵操作。
- **驗收**：兩位玩家可進同房間；移動同步；斷線不永久占用房間；單人模式不依賴伺服器。

### 階段閘門
Phase 1 通過前不大量製作玩法系統；Phase 1 驗收前不做戰鬥、建造、多人。

---

## 10. 範圍控管
- **P0**：第一個可玩版本必備；**P1**：Phase 5 前加入，可延後；**P2**：有餘力才做。
- 砍功能順序：遺跡/洞穴 → 日夜與雨 → 手把與其他語系 → 觀景點區域（保留遠山視野）→ 夥伴互動（保留跟隨）→ 多人（Phase 6）。
- **不可砍**：移動手感、存檔可靠性、三個任務、迷霧外觀切換、美術風格驗收。

---

## 11. AI Coding 工作流程
1. 確認階段與任務範圍；閱讀 `PROGRESS.md`、本文件相關章節與既有程式。
2. 提出簡短計劃；**單次只做一個可驗收功能**。
3. 實作 → `tsc`、ESLint、相關 Vitest、建置；涉及畫面則截圖並檢視。
4. 修正本次造成的問題；更新 `PROGRESS.md`（階段、已完成、進行中、下一步、已知問題、決策連結）。
5. 回報：修改檔案、測試結果、已知問題、下一步。

**完成定義**：可實際執行；驗收逐項通過；測試與型別檢查通過；畫面項目有截圖證據；無空實作或假資料。

**規則**：優先用既有依賴與架構；不為過測試移除功能；不用空 `catch`；缺資產要有明確錯誤處理與後備；遇待決事項採預設並記入 `DECISIONS.md`，不空等；兩份文件衝突時先指出，不自行猜測。

**專案指示檔（`CLAUDE.md`）**：僅指向本文件、`mistwood_game_spec.md`、skill、`PROGRESS.md`，與「單次只做一個可驗收功能」。

---

## 12. 第一批任務（只做這些）

**任務 1A：骨架與場景**
1. pnpm 初始化 Vite + React + TS strict + Tailwind；安裝 R3F/drei/Rapier/Zustand。
2. 加入 Electron（`main.ts`、`preload.ts`，安全設定如 2.2）；dev 與 build 分離。
3. 建立目錄結構與 `game-core`（含 ESLint `no-restricted-imports`）。
4. 小型草原場景 + 載入一個 GLB；FPS/draw call 面板；`scripts/screenshot`（書籤切換）。
5. 建立 `PROGRESS.md`、`DECISIONS.md`（含第 0.2、0.3 條目）、`ASSETS.md`、`CLAUDE.md`。
6. 驗收：Phase 0 條件（動畫驗證留待 1B）。

**任務 1B：角色與移動**
1. **先做動畫來源驗證**：選定 3 頭身角色，套用 Idle/Walk/Run/Jump/Fall/Land，確認不變形；失敗則依 4.6 處理並記入 `DECISIONS.md`。
2. 第三人稱移動、跑、跳、攝影機（旋轉、跟隨、角度限制、shape cast 避讓）；輸入層與邏輯分離。
3. 動畫狀態機切換正確。

**任務 1C：碰撞與互動**
1. 地面與基本碰撞（坡度、台階）；掉落重置。
2. 一個簡單可互動物件 + 互動提示（sensor 查詢）。
3. 接著進入 Phase 1 風格切片與 `uMist` 滑桿。

通過 Phase 0 與 Phase 1 驗收後，再依第 9 節進入後續階段。

---

## 13. 風險登錄
| 風險 | 緩解 |
|---|---|
| Q 版角色套標準骨架動畫變形 | Phase 0/1B 閘門；重新綁定或自製動畫集 |
| 免費素材風格不一 | 統一材質與調色；Phase 1 風格切片先驗證 |
| 效能不達標 | Phase 1 量測；超標才做串流；畫質分級 |
| 存檔損壞或遷移失敗 | 原子寫入、備份、zod、遷移測試 |
| 無頭截圖誤導效能判斷 | 效能只在實機量測 |
| macOS 簽章缺帳號 | Phase 5 前確認 D-04 |
| 多人工作量遠大於預期 | Phase 6 維持可選；規則層與 Authority 從 Phase 2 預備 |
| 範圍膨脹 | 嚴守第 10 節優先級與砍功能順序 |

---

## 14. 規格書章節對照
| 原規格書 | 本文件 |
|---|---|
| 1 願景 / 2 故事 | 1 |
| 3 美術 | 4 |
| 4 世界 | 1.4、5 |
| 5 角色與相機 | 6.1、4.6 |
| 6 系統 | 6 |
| 7 多人 | Phase 6、3.2 |
| 8 效能 | 7 |
| 9 階段 | 9 |
| 10 範圍 | 10 |
| 11 待決 | 0.3 |
| 12 交付 | 11 |
| 13 第一批任務 | 12 |
