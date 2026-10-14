---
name: mistwood-verify
description: Mistwood 專案的分層驗證流程。完成任何程式改動、準備 commit / push、決定要跑哪個 e2e suite 或要不要截圖時使用。
---
# 分層驗證

e2e 每個 suite 都會啟動一次 Electron（約 10–20 秒），39 個全跑要好幾分鐘，所以只跑改動範圍內的 suite。

## 每次改動後（L1，秒級）
`pnpm vitest related <改過的檔案> --run`

## 任務完成前（L2，必過）
`pnpm check`（typecheck + lint + test），再 `pnpm build`。

## 改動位置 → 要跑的 e2e 與截圖

| 改到 | 跑的 e2e（`node e2e/<名稱>.e2e.mjs`） | 截圖 |
|---|---|---|
| `src/game-core/**`（不含 save）、`src/data/**`、文件、`scripts/gen-*` | 不跑 | 不拍 |
| `src/game-core/save/**`、存檔相關 | `save` | 不拍 |
| `src/game/character`、`src/game/input`、`src/world/physics`、`game-core/character`、`game-core/input` | `movement`、`bounds` | 動畫改動才拍（`--anim`） |
| `src/world/terrain`、`boundary`、`water`、湖與木橋 | `bounds`、`lake` | 受影響書籤 |
| `src/world/**` 的互動、碰撞、寶箱 | `world`、`harvest` | 受影響書籤 |
| 採集（樹、岩、花、草藥） | `harvest` | `--harvest` |
| 任務、對話、NPC（`game/npc`、`dialogueController`、`game-core/quest|dialogue|npc`） | `npc`、`quest` | `--npc` |
| 教學（`TutorialSystem`） | `tutorial` | 不拍 |
| 區域迷霧（`RegionTracker`、`LocationVisibility`、區域判定） | `region` | `--region` |
| 星光夥伴 | `companion` | `--companion` |
| 戰鬥、敵人、掉落（`game/combat`、`world/combat`） | `combat`、`melee` | `--combat` / `--melee` |
| 魔法（星光衝擊、流星雨） | `magic` | `--magic` |
| 怪物模型與生成 | `monsters` | `--monsters` |
| 怪物行為（盤旋、縮殼、吐泥，`enemyAi` 的 behavior）、程式造型怪物（`CritterEnemy`）、泥團 | `forestmobs`（改到共用 AI 時加 `combat`） | `--monsters --enemies=<id>` |
| 建造（湖心島） | `build` | `--build` |
| 酒館與室內子場景 | `tavern` | `--tavern` |
| 日夜、天空、光照（`world/sky`、`GameClock`、`render/timeLook`、村屋窗燈 `render/windowGlow`） | `daynight` | `--daynight` |
| 環境生命（羊、炊煙、風車、告示板） | `ambient` | `--ambient` |
| 音效與音樂 | `audio` | 不拍 |
| 手把 | `gamepad` | `--gamepad` |
| 設定、按鍵重新配置 | `settings` | `--menu` |
| 燈塔地窖（`quest_dawn_007`、奧林、出入口 `requires` 的 `questActive` / `night`、第二個室內子場景、石環） | `cellar`（改到室內或出入口時加 `tavern`、`lighthouse`、`glowmoss`） | `--cellar`（室內要從地窖門走進去，直接傳送不會關掉戶外的霧） |
| 河邊的腳印（`quest_dawn_006`、沒有發起人的任務與自動完成、`activate` 的 `startsQuest` / `consume` / `after`、角兔幼崽） | `footprints`（改到機關規則時加 `forestquest`、`lighthouse`） | `--footprints` |
| 花園（`quest_dawn_005`、桃樂、`build` 目標、建造物 `unlock` / `growth`、花圃、鬆土） | `garden`（改到建造時加 `build`） | `--garden` |
| 製作（`craft.ts`、`crafting.json`、`Craft`、`CraftPanel`、對話效果 `openCraft`） | `craft`（改到琳娜的對話時加 `forestquest`、`letters`） | `--shop`（含草藥桌） |
| 消耗品（`UseItem`、`consumables.ts`、背包的「使用」、快速鍵 X、HUD 回復藥數量） | `potion`（改到戰鬥時加 `combat`） | 不拍 |
| 商店（`shop.ts`、`shops.json`、`BuyItem` / `SellItem`、`ShopPanel`、對話效果 `openShop`） | `shop`（改到米菈的對話時加 `npc`） | `--shop` |
| 送信（`quest_dawn_004`、`talk` 目標 / `QuestTalk`、`questTalk*` 條件、尼可、乾布） | `letters`（改到對話或條件時加 `npc`、`quest`） | `--letters` |
| 任務日誌（`QuestJournal`、`TrackQuest`、任務分類、追蹤列篩選） | `journal`（改到追蹤列時加 `quest`） | `--journal` |
| 小地圖、世界地圖 | `map` | `--map` |
| 地圖切換、螢苔祕林（`maps.ts`、`glowmossTerrain`、`location.ts` 的 travelToMap、`MapOnly`） | `glowmoss`（改到地形分派或邊界時加 `bounds`、`movement`） | `glowmoss_*` 書籤 |
| 澄鏡湖（`mirrorlakeTerrain`、`lakeModels.ts`、`gen-mirrorlake.ts`、各地圖的水面 `Water map=`、水道入口） | `mirrorlake`（改到共用的地圖切換或存檔遷移時加 `glowmoss`、`map`、`save`；改到水面或落水時加 `lake`） | `mirrorlake_*` 書籤（例如 `node scripts/screenshot.mjs phase9 mirrorlake_temple`） |
| 澄鏡湖的怪物（水泡精分裂 `splitInto`、霧鷺影 `retreat` 瞬移、鏡殼蟹 `carapace` 正面防禦、`LakeCritter.tsx`） | `lakemobs`（改到共用的敵人 AI、姿態或吐泥時加 `forestmobs`、`monsters`、`combat`） | `--monsters --enemies=mob_bubble_wisp,mob_mist_heron,mob_mirror_crab` |
| 澄鏡湖的任務（伊芙、`quest_lake_001` 倒影、`activate.message` 啟動時的訊息） | `lakequest`（改到奧林時加 `cellar`；改到 `activate` 或動物居民時加 `forestquest`、`npc`） | `mirrorlake_eve`、`mirrorlake_reflection` 書籤 |
| 水鏡光路（`lightPath.ts`、`lightPaths.json`、`MirrorPuzzle.tsx`、`turn.quest`、水行護符的涉水深度） | `lightpuzzle`（改到 `turn` 時加 `forestquest`、`puffking`；改到落水時加 `lake`、`movement`） | `--lightpuzzle`（例如 `node scripts/screenshot.mjs phase9 mirrorlake_entry --lightpuzzle`） |
| 璃漪頭目戰（`LiyiKoi.tsx`、頭目資料的 `veil`、神殿兩側的水鏡、`quest_lake_003`） | `liyi`（改到共用的頭目 AI 或 `bossRuntime` 時加 `boss`、`puffking`） | `--liyi`（例如 `node scripts/screenshot.mjs phase9 mirrorlake_temple --liyi`） |
| 螢苔祕林的任務與水道（琳娜、奇奇、`activate` / `turn` 機關、`waterway.ts`、`Waterway.tsx`、`flowWater`） | `forestquest`（改到共用的互動或修理時加 `lake`、`world`） | `--waterway`（例如 `node scripts/screenshot.mjs phase8 glowmoss_wheel --waterway`） |
| 頭目戰（`bossAi.ts`、`bossRuntime.ts`、`MossThump`、`BossArena`、`BossBar`、頭目資料） | `boss`（改到共用的戰鬥或 `combatRuntime` 時加 `combat`、`forestmobs`） | `--boss`（例如 `node scripts/screenshot.mjs phase8 glowmoss_crown --boss`） |
| 霧團噗啾王（`PuffKing`、星光鏡、衝撞 / 霧球 / 暈眩、小噗啾 NPC；改到共用的 `bossAi` / `bossRuntime` 時兩個頭目都要跑） | `puffking`（改到共用頭目框架時加 `boss`、`forestguard`） | `--puffking`（例如 `node scripts/screenshot.mjs phase7 highland --puffking`） |
| 晨曦燈塔（`quest_dawn_003`、燈罩碎片、迷霧核心、燈籠室、`LighthouseBeam`、`lighthouseRuntime`、林道入口條件） | `lighthouse`（改到林道入口時加 `glowmoss`） | `--lighthouse`（例如 `node scripts/screenshot.mjs phase7 highland --lighthouse`） |
| 苔冠下的守衛（`quest_forest_003`、根源石、戰後的苔咚 NPC、程式造型 / 有出現條件的 NPC、林間水道） | `forestguard`（改到 NPC 系統時加 `npc`、`quest`） | `--guardian`（例如 `node scripts/screenshot.mjs phase8 glowmoss_crown --guardian`） |
| 存檔（`game/save`） | `save` | 不拍 |
| `src/render/**`（shader、後處理、植被、迷霧外觀） | 所屬功能的 suite（上表）；純視覺不跑 | 受影響書籤（`--mist` 只在迷霧相關時加） |
| `src/app`、`src/ui`、React effect / 生命週期 | `dev`（StrictMode）＋所屬畫面的 suite | 有改畫面才用 `--menu` |
| `e2e/**` 本身 | 只跑改到的那個 suite | 不拍 |
| `electron/**`、`vite.config.ts`、`package.json` 建置設定、`public/` 資產載入 | 完整 `pnpm e2e` | 不拍 |
| `docs/**`、`*.md` | 不跑 | 不拍 |

改動跨多個區域時，取各列的並集，去掉重複的。

## 收尾與 push 前（L4）
- 一個任務收尾時跑一次 `pnpm e2e`（它會先 build，不必再手動 build）。
- 只改純 game-core、資料、文件：可以略過，並在 `docs/PROGRESS.md` 註明「略過 e2e：純 game-core / 文件」。

## 跑 e2e 的細節
- 單獨跑 suite 前，若 `src/`、`electron/` 有改動，先執行一次 `pnpm build`。多個 suite 共用同一份 dist，不要每個 suite 前都 build。
- 要跑的 suite 數量：先看上表，改幾個區域就跑幾個，不要整組跑。
- 失敗時先修，然後只重跑「同一個」失敗的 suite，不要重跑全部。
- 若某 suite 在整組連跑時才失敗（例如視窗崩潰），先單獨重跑：單獨通過表示是記憶體壓力，記入 `docs/PROGRESS.md`「已知問題」，不要無限重跑。

## 截圖
- 只拍受影響的書籤：`node scripts/screenshot.mjs <階段> <書籤...> [--flag]`，書籤與旗標說明見 `scripts/screenshot.mjs` 檔頭。
- 不要重拍整組。需要比對時，前後各一張即可。
- 截圖只用來檢查畫面是否正確，不用來推斷效能。

## 原則
1. 邏輯寫成 game-core 純函式，用 Vitest 驗證；不要靠 e2e 算數值。
2. e2e 只驗「接起來能不能跑」，用 `__mistwoodDebug` 讀狀態再 assert，不靠截圖判斷。
3. 回報結果只列失敗項目與總數（例如「24 中 1 失敗：movement ✗ …」），不貼整段 log。
4. 手感與好不好玩由使用者自己試玩判斷，不要花 token 讓 AI 試玩。
5. 效能量測（`scripts/perf.mjs`）只在階段驗收或改到渲染負載時跑，且量測時使用者不要操作電腦。
