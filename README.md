# 迷霧之森：星光旅人（Mistwood）

一款 3D 可愛風格的開放世界冒險遊戲。主角在明亮的「晨曦谷地」醒來，世界被迷霧籠罩，玩家要一步步找回森林的光。

目前以 **Electron 桌面版**開發（Windows、macOS），先做單人遊戲，多人連線列為最後的選配階段。

> **目前狀態：Phase 1 已完成，等待美術風格驗收。** 可以在草原、村莊、森林與觀景點之間走動、轉動視角，打開寶箱，切換迷霧濃淡，並使用主選單與暫停選單。尚無存檔、採集、戰鬥與任務。詳見 [docs/PROGRESS.md](docs/PROGRESS.md)。

---

## 目錄

- [功能現況](#功能現況)
- [操作方式](#操作方式)
- [快速開始](#快速開始)
- [常用指令](#常用指令)
- [專案結構](#專案結構)
- [技術棧](#技術棧)
- [架構原則](#架構原則)
- [畫面與效能](#畫面與效能)
- [測試與驗證](#測試與驗證)
- [文件索引](#文件索引)
- [開發路線圖](#開發路線圖)
- [已知問題](#已知問題)
- [授權與素材](#授權與素材)

---

## 功能現況

| 系統 | 狀態 |
|---|---|
| Electron 桌面殼、安全設定（contextIsolation、無 nodeIntegration、CSP） | 完成 |
| 主選單（開始遊戲、畫質、離開）與暫停選單（繼續、畫質、回主選單） | 完成 |
| 角色移動：走、跑、跳、二段跳禁止、坡地、上台階、掉出地圖回安全點 | 完成 |
| 跟隨攝影機：滑鼠旋轉、滾輪縮放、碰撞避讓（被樹或岩石擋住會拉近） | 完成 |
| 環境碰撞：樹、岩石、寶箱依距離啟用碰撞體 | 完成 |
| 互動：靠近寶箱 → 按 E 打開 → 顯示紙條訊息 | 完成（只有寶箱） |
| 迷霧外觀 `uMist`：濃、淡、清三段，平滑過渡，影響霧、天空、色調與飽和度 | 完成 |
| 世界內容：草原、小村莊（房屋、酒館、井、風車、柵欄牧場）、森林、遠山、飄移的雲 | 完成 |
| 草與野花：風動、依距離淡出、避開小路與碰撞體 | 完成 |
| 後處理：Bloom、飽和度、暗角、tone mapping、MSAA，低畫質時關閉 | 完成 |
| 存檔、採集、背包、合成 | Phase 2 |
| NPC、對話、任務、戰鬥、建造 | Phase 3 之後 |
| 多人連線 | Phase 6（選配） |

---

## 操作方式

| 動作 | 按鍵 |
|---|---|
| 移動 | `W` `A` `S` `D` 或方向鍵 |
| 跑步 | 按住 `Shift` |
| 跳躍 | `Space` |
| 互動（打開寶箱） | `E` |
| 旋轉視角 | 點擊畫面鎖定滑鼠後移動滑鼠（`Esc` 釋放） |
| 縮放視角 | 滾輪 |
| 暫停 | `Esc`（暫停時角色與互動停住） |

按鍵定義在 `src/data/keybindings.json`，可直接修改重新配置。

---

## 快速開始

### 環境需求

| 工具 | 版本 |
|---|---|
| Node.js | 24 |
| pnpm | 12（可用 `corepack enable` 啟用） |
| 作業系統 | macOS（開發與量測環境）、Windows（規劃中，尚未在 Windows 上完整驗證） |
| 顯示卡 | 支援 WebGL 2；8 GB 統一記憶體以上的機器建議使用低或中畫質 |

### 安裝與試玩

```bash
git clone https://github.com/YisoTsao/misty-forest.git
cd misty-forest
pnpm install
pnpm dev:electron
```

`pnpm dev:electron` 會同時啟動 Vite 開發伺服器與 Electron 視窗。進入後：

1. 在主選單按「開始遊戲」。
2. 點擊畫面鎖定滑鼠，用 `W A S D` 移動、移動滑鼠轉視角。
3. 按 `Esc` 暫停，可調整畫質或回到主選單。

### 跳過主選單的網址參數（除錯用）

開發與截圖時可用環境變數 `MISTWOOD_START_QUERY` 或網址參數控制初始狀態：

| 參數 | 作用 |
|---|---|
| `play=1` | 跳過主選單，直接進入遊戲 |
| `quality=low／medium／high` | 設定初始畫質 |
| `mist=0～1` | 設定初始迷霧濃度 |
| `debug=1` | 顯示除錯面板（FPS、draw calls、三角面、記憶體、迷霧滑桿、攝影機書籤） |

---

## 常用指令

| 指令 | 用途 |
|---|---|
| `pnpm dev` | 只啟動網頁版開發伺服器（http://localhost:5173） |
| `pnpm dev:electron` | 開發模式的桌面版（StrictMode、熱更新） |
| `pnpm start` | 執行已建置的桌面版（需先 `pnpm build`） |
| `pnpm typecheck` | 三個 tsconfig 的型別檢查 |
| `pnpm lint` | ESLint（含 game-core 的依賴限制） |
| `pnpm test` | Vitest 單元測試 |
| `pnpm build` | 型別檢查 + 建置網頁版與 Electron 程式 |
| `pnpm e2e` | 建置後執行三組 Electron 端對端測試（移動、世界、開發模式實際操作） |
| `pnpm pack` | 產生未壓縮的桌面版目錄（`release/`） |
| `pnpm dist` | 產生安裝檔：macOS `.dmg`、Windows `.exe`（NSIS） |
| `node scripts/screenshot.mjs <階段> [--anim] [--mist] [--interact] [--menu]` | 依攝影機書籤截圖，輸出到 `docs/screenshots/<階段>/` |
| `node scripts/perf.mjs` | 實機效能量測（會開視窗，量測時請勿操作電腦） |
| `pnpm data:placements` | 重新產生世界的樹、岩石與寶箱擺放（`src/data/placements.json`） |

---

## 專案結構

```
misty-forest/
├── electron/          # Electron 主程序與 preload（最小 IPC 介面）
├── src/
│   ├── game-core/     # 純 TypeScript 遊戲邏輯：移動、互動、安全點、
│   │                  #   流程、畫質、資料 schema。不得 import React、Three、Rapier、Electron
│   ├── game/          # 遊戲層：狀態（Zustand）、輸入管理、角色、除錯 API
│   ├── world/         # R3F 場景：地形、植被、天空與遠景、光照、相機、實體
│   ├── render/        # Shader、材質、迷霧 uniform、後處理
│   ├── ui/            # React UI：主選單、暫停選單、訊息視窗、除錯面板、HUD
│   ├── app/           # 進入點與根元件
│   └── data/          # 資料檔：prefabs、擺放、相機書籤、按鍵、i18n 文字
├── public/models/     # GLB 模型與貼圖（素材來源見 docs/ASSETS.md）
├── e2e/               # Electron 端對端測試
├── scripts/           # 建置、開發、截圖、效能量測與資料產生腳本
├── docs/              # 進度、決策、資產、效能與截圖紀錄
├── mistwood_dev_spec_final.md   # 最終開發規格書（優先依此開發）
└── CLAUDE.md          # AI 協作的專案指示
```

`game-core` 與渲染層分離，是為了讓遊戲規則可以單獨測試，也可以日後搬到伺服器上重用。

---

## 技術棧

| 領域 | 選用 |
|---|---|
| 語言 | TypeScript 6（strict） |
| 桌面 | Electron 44、electron-builder |
| 打包 | Vite 8（不使用 Next.js，桌面遊戲不需要 SSR） |
| UI | React 19、Tailwind CSS 4 |
| 3D | React Three Fiber 9、Three.js 0.186、@react-three/drei |
| 後處理 | @react-three/postprocessing、postprocessing |
| 物理 | @react-three/rapier（Rapier3D WASM） |
| 狀態 | Zustand（之後加入 XState 管理任務與 AI） |
| 資料驗證 | zod 4 |
| 測試 | Vitest（單元）、Playwright（Electron 端對端與截圖） |
| 品質 | ESLint、tsc |
| 套件管理 | pnpm |

依賴變更需先在 `docs/DECISIONS.md` 記錄理由。

---

## 架構原則

- **純邏輯核心**：規則與狀態放在 `game-core`，不依賴任何渲染或平台函式庫（ESLint 強制）。
- **指令與事件**：玩家動作送出指令，由規則層驗證後產生事件，狀態由事件推導。
- **資料驅動**：物件、擺放、書籤、按鍵、文字都在資料檔，不寫死在元件裡。資料分為定義、擺放、執行期狀態、存檔四層。
- **渲染迴圈不 setState**：`useFrame` 內只操作 ref 與 uniform，避免每幀重新渲染。
- **資源生命週期明確**：WASM 與 GPU 資源在 effect 內建立、cleanup 釋放，並通過 React StrictMode 的雙重掛載測試。
- **Electron 安全**：contextIsolation 開啟、無 nodeIntegration、預載腳本只暴露最小 API、禁止外部導向、限制 CSP。

---

## 畫面與效能

### 畫質等級

| 等級 | 草與花密度 | 可見距離 | 後處理 | 陰影解析度 | 最大 DPR |
|---|---|---|---|---|---|
| 低 | 0.6 / 0.5 | 28 m | 關閉 | 1024 | 1 |
| 中 | 1.4 / 0.9 | 42 m | 開啟 | 2048 | 1.5 |
| 高 | 2.4 / 1.4 | 55 m | 開啟 | 2048 | 2 |

### 實機數據（MacBook Pro M1 Pro）

| 項目 | 數值 | 目標（規格 7） |
|---|---|---|
| 幀率（vsync） | 120 FPS，所有視角 | 60 |
| 不限幀率 | 226 FPS 以上 | — |
| Draw calls | 最多 122 | 設計 300、硬上限 400 |
| 三角面 | 最多 39 萬 | 設計 100 萬、硬上限 150 萬 |
| 冷啟動 | 1.3 秒 | 10 秒以內 |
| 連續遊玩 3 分鐘 | 幾何與貼圖數量持平 | 無持續成長 |

完整紀錄與量測方法見 [docs/PERF.md](docs/PERF.md)。

---

## 測試與驗證

| 層級 | 指令 | 內容 |
|---|---|---|
| 型別與 lint | `pnpm typecheck`、`pnpm lint` | 每次修改 |
| 單元測試 | `pnpm test` | 移動、互動、安全點、流程、植被散佈、畫質、碰撞、迷霧、資產檔案等（104 項） |
| 端對端 | `pnpm e2e` | Electron 實際操作：移動、攝影機、碰撞、寶箱、暫停與選單、開發模式的完整流程 |
| 視覺驗證 | `node scripts/screenshot.mjs` | 每個書籤輸出晴朗與迷霧版，檢查模型、材質與色調 |

**注意**：無頭模式的截圖只能檢查畫面正確性，不能用來推斷效能。效能數字必須在實機量測。

滑鼠鎖定測試需要視窗位於作業系統前景，自動測試時若有人正在使用電腦，該項會略過並註明原因。

---

## 文件索引

| 文件 | 內容 |
|---|---|
| [mistwood_dev_spec_final.md](mistwood_dev_spec_final.md) | 最終開發規格書：玩法、美術、系統、效能、階段與驗收 |
| [CLAUDE.md](CLAUDE.md) | AI 協作規則（單次只做一個可驗收功能、必過的檢查） |
| [docs/PROGRESS.md](docs/PROGRESS.md) | 目前進度、下一步、續作說明（在另一台電腦接續時先讀這份） |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 技術與設計決策紀錄（T-xx、D-xx） |
| [docs/ASSETS.md](docs/ASSETS.md) | 每個資產的來源、授權與用途 |
| [docs/PERF.md](docs/PERF.md) | 效能量測紀錄與方法 |
| [docs/art/reference/](docs/art/reference/README.md) | 風格參考圖（放入後與截圖比對） |
| [docs/screenshots/](docs/screenshots) | 各階段截圖 |

---

## 開發路線圖

| 階段 | 內容 | 狀態 |
|---|---|---|
| Phase 0 | 專案骨架、動畫來源驗證 | 完成 |
| Phase 1 | 風格驗證場景與可玩角色 | 完成，待使用者風格判定 |
| Phase 2 | 探索、互動與存檔框架（存檔、採集、背包） | 未開始，需確認 Phase 1 驗收 |
| Phase 3 | 戰鬥、NPC 與任務 | 未開始 |
| Phase 4 | 建造與家園 | 未開始 |
| Phase 5 | 美術、音效、效能完善與發行 | 未開始 |
| Phase 6 | 多人連線（選配） | 未開始 |

每個階段都有可量測的驗收條件與閘門，詳見規格書第 9 節。

---

## 已知問題

- 觀景點在濃霧時幾乎全灰：攝影機離地約 90 m，超過濃霧的可見距離。
- 樹木與岩石使用小型素材放大，造型較簡單。
- 地形顏色由 shader 程式產生，尚未使用手繪貼圖。
- 風車扇葉目前不會轉動。
- 寶箱狀態與畫質設定尚未存檔（Phase 2 處理）。
- 滑鼠鎖定在視窗不在前景時無法啟用。
- 尚未在 Windows 或 8 GB 機器上完成實機效能量測。

---

## 授權與素材

遊戲的 3D 模型與貼圖主要來自 KayKit（CC0 授權），包括角色、樹木、岩石、寶箱與村莊建築。草地、迷霧、天空與山脈等由程式產生。每個檔案的來源與授權記錄在 [docs/ASSETS.md](docs/ASSETS.md)。

本專案程式碼的授權尚未決定。

