# 第二章 Phase 0：盤點與差距清單

> 依 `docs/CHAPTER_02_GLOWMOSS_WOOD_SPEC.md` §15 Phase 0。內容定義見 Bible §6，決策見 DECISIONS T-185、T-186。
> 盤點日期：2026-10-20（`develop` @ `459b026`）。只讀程式，沒有修改。
> 狀態：**使用者 2026-10-20 確認，§6 四項都採用建議（DECISIONS T-187）**。

## 1. 技術盤點：重用、擴充、新建

圖例：**重用**＝直接用；**擴充**＝現有系統加欄位或功能；**新建**＝目前沒有。

| 系統 | 現有實作 | 第二章需要 | 判定 |
|---|---|---|---|
| 地圖與切換 | `game-core/world/maps.ts`：所有地圖在同一個物理世界的不同座標（T-117），每張圖可玩區 ±148 m；螢苔祕林在 `GLOWMOSS_ORIGIN (2000, 0)`；出入口 prefab 的 `enter.requires` 可以設任務條件 | 七區 A–G、階段解鎖 | **重用**地圖框架；**新建**地形 |
| 地形 | `glowmossTerrain.ts`（純函式高度、小徑、地標座標）＋ `scripts/gen-glowmoss.ts`（固定種子產生 `placements.json`） | 新的七區配置 | **新建**（沿用同樣的寫法） |
| 區域 | `types.ts` 的 `regionIds`（舊的 `moss_trail`、`moss_glade`、`root_maze`、`moss_crown`）、`regions.json`、`regions.ts` | 新區域 A–G | **擴充**：新 ID，舊 ID 移除並寫遷移 |
| 互動物件 | `prefabSchema`：`harvest`、`open`（寶箱）、`read`（告示）、`repair`、`activate`（可設 `quest`、`consume` 消耗物品、`ordered` 依序、`boss` / `afterBoss`、`message`）、`turn`（多段轉動）、`enter` | 燈柱、採集點、水輪、石碑、寶箱、共鳴石柱、污染根瘤 | **重用**（大部分只要寫資料） |
| 星光燈柱 P-01 | `trail_lantern`（舊 8C 路燈：`activate` ＋限定任務） | 消耗純淨螢苔、點亮後降低局部迷霧、三種狀態 | **擴充**：加上 `consume`；迷霧用任務獎勵 `mist` 或啟動時改變區域迷霧 |
| 水輪 P-02 | `turn` ＋ `waterway.ts`（舊水道：水流經過閘門到節點） | 三個水輪、水流方向、石塊、壓力板 | 水輪**重用**；**新建**「可推動石塊」與「壓力板」（目前沒有可推動的物件） |
| 星晶反射 P-03 | `lightPath.ts`（澄鏡湖水鏡光路：光源 → 鏡子轉 90° → 終點） | 旋轉晶體、光對準符文開門 | **重用**（Bible §6.8 已指定） |
| 任務 | `quest.ts`：locked / available / active / completed（「目標完成、待回報」由 `isQuestReady` 推導）；目標類型 collect、repair、activate、defeat、boss、visit、build、talk；前置、接取物品、獎勵（物品、迷霧、物件）只結算一次 | 規格 §8.4 的狀態與目標類型 | **重用**。沒有 `failed`（規格只在明確設計時使用，第二章沒有） |
| 對話 / NPC | `dialogues.json`、`npcs.json`、`npcRuntime.ts`；對話條件與效果 | 四位新 NPC | **重用**；模型見 §2 |
| 採集與掉落 | `harvest` ＋ `lootTables.json`（`chance` 機率）；`glowmoss_tuft` 是現成的螢苔採集點 | 純淨螢苔、微光孢子；護腕「提高稀有素材機率」 | **重用**；稀有機率加成要**擴充**（§4） |
| 怪物 | `enemies.json` ＋ `combat.ts`：行為 `orbit`、`shell`、`spit`、`carapace`，`splitInto` 分裂；`CritterEnemy.tsx` | 史萊姆（跳撞、黏液、分裂）、菌帽小妖（躲藏、成群、撿東西）、森林狼（繞行、突進、硬直、叫同伴）、幻霧螢靈（距離、追蹤彈、瞬移、致盲、提燈現形） | 史萊姆**重用**（`spit` ＋ `splitInto`）；其餘三種要**新增行為** |
| 頭目 | `bossAi.ts` ＋ `bossRuntime.ts`（苔咚：根刺、震地、孢子、縮傘；戰場水槽 = 戰鬥中啟動的物件；倒下重試、頭目回位） | 枯根守衛兩階段、根噬者三階段（石柱、召喚螢靈、淨化不死亡） | **擴充**：苔咚的招式與「戰鬥中啟動物件」可對應根刺與共鳴石柱；階段、召喚、淨化結局要新增 |
| 法術 / 星光能力 | `spells.json`：每職業三個法術（nova / bolt / meteor），星光值 `mp` | 照明（現形、揭露）、攻擊（對污染核心加成）、共鳴（啟動機關） | **擴充**：先做一個共用介面與一個完整技能（規格 §10.2） |
| 翻滾閃避 | 沒有（按鍵只有移動、跳、攻擊、重擊、三個法術） | 規格 §10.1 要求；森林狼的設計靠翻滾 | **新建**（Phase 3 前要有） |
| 迷霧 | `mist.ts`：每區三段（dense / light / clear），任務與擊殺里程碑改變 | 燈柱降低局部迷霧、深層週期性濃霧、迷霧持續傷害 | 區域迷霧**重用**；週期濃霧與持續傷害**新建**（Phase 3） |
| 道具 / 背包 | `items.json`（類別 material、special、quest、consumable、currency；`use` 可回血） | 任務道具、素材 | **重用** |
| 裝備 | **武器不是道具**：`weaponIds` 是固定的 7 種武器類型，職業決定能用哪幾種；`water_charm` 的效果寫死在 `Player.tsx`（背包裡有就能潛水） | 螢晶短劍、螢苔法杖、守林者護腕 | **新建**裝備層（§4） |
| 製作 / 商店 | `crafting.json`（工作台）、`shops.json`、種籽幣 | 聚落工作台、伊索的商店 | **重用** |
| 圖鑑 | 沒有（只有任務日誌 `QuestJournal`） | 規格 §11.3「建議」 | **新建**（低優先，可延後） |
| 存檔 | v17，`migrate.ts` 逐版遷移；物件差異、任務、已擊敗頭目、迷霧都有存 | 規格 §12.4 | **重用**；第二章需要 v18（§5） |
| 多人 | 怪物與戰鬥由各客戶端自己算（T-169）；伺服器只轉送動作 | 規格 §12.5 只要求預留 | 不變；機關與頭目共享留給 Phase 11 的伺服器權威 |
| 測試 | Vitest（`game-core` 純函式）；46 個 e2e suite；`scripts/screenshot.mjs`、`perf.mjs` | 規格 §14 | **重用** |

## 2. 資產盤點

| 需求 | 現有 | 判定 |
|---|---|---|
| 樹、蘑菇、岩石、蕨類、石柱 | Kenney Nature Kit（含 8A 加入的暗色樹 7 種、蕨類、蘑菇、石頭）、KayKit Hexagon 樹與岩石；`render/forestModels.ts` 的程式造型 | **重用**，換成規格的色票（苔綠、青綠、紫色污染） |
| 螢苔、發光植物、螢火蟲、孢子 | 程式造型（`glowmoss_patch`、`glowmoss_tuft`）、`Fireflies.tsx` | **重用** |
| 星光燈柱（三種狀態） | `trail_lantern` / `trail_lantern_lit`（兩種狀態） | **擴充**第三種狀態（可互動的提示） |
| 水輪、石橋、木橋 | 舊 8C 水輪、`render/forestModels.ts` | **重用**後調整 |
| 蘑菇屋、樹根屋、石拱門、古樹祭壇、晶洞 | 沒有（Kenney 只有小蘑菇） | **新建**：程式造型或找 CC0 素材包 |
| 螢苔史萊姆 | Quaternius `GreenBlob`（已用來做風絮團、霧凝史萊姆，換色） | **重用**（換色＋背上加螢苔） |
| 菌帽小妖 | Quaternius `Mushnub` | **重用**（換色） |
| 森林狼、幻霧螢靈、枯根守衛、根噬者 | 沒有 | **新建**：找 CC0 模型或程式造型 |
| 菇菇婆婆、莉露、伊索、無名旅人 | 沒有；目前 NPC 用 KayKit Adventurers（琳娜、奇奇也是 placeholder） | **新建**；開發期可先用 placeholder（規格 §17.9：要標註，不能當作通過美術驗收） |
| 任務道具與裝備圖示 | `ui/ItemIcon.tsx` 以 SVG 畫圖示 | **擴充**（參考圖：星光羅盤、螢光提燈、純淨螢苔、共鳴石片、三件裝備） |
| 音效 | Kenney 音效 46 個 | **重用** |

授權：新資產照 `docs/ASSETS.md` 的格式登錄（來源、授權、商業使用、修改）。

## 3. 差距清單（會影響現有功能的部分）

1. **澄鏡湖的入口**：`gate_to_mirrorlake` 要求 `quest_forest_003`、`quest_lake_001` 的前置也是 `quest_forest_003`。改版後要改成 `quest_forest_008`（T-186），但第二章做完之前這個任務還不存在 → 過渡期間的作法見「要決定的事」第 1 點。
2. **第一章的送信任務**：`quest_dawn_004` 要把信送到螢苔祕林的琳娜手上（`e2e/letters`）。琳娜回到晨曦谷地，信改在村裡交。
3. **奇奇**：`quest_forest_002` / `003` 的發起人；澄鏡湖 `quest_lake_002` 也是他。祕林任務移除後，他在澄鏡湖的第一次出場對話可能要改。
4. **舊存檔**：`quest_forest_001`–`003` 的 ID 沿用但內容不同；舊的機關物件、苔咚的擊敗紀錄、舊區域的迷霧與探索紀錄都要處理 → v18 遷移（§5）。
5. **e2e**：`glowmoss`、`forestmobs`、`forestquest`、`boss`、`forestguard` 要改寫或刪除；`mirrorlake`、`lakequest`、`lightpuzzle`、`letters` 要調整前置；`screenshot.mjs` 的書籤與 `perf.mjs` 的螢苔祕林路線要更新。
6. **規格 §17.1** 要求的 `AGENTS.md`、`ART_BIBLE.md` 不存在，以 `CLAUDE.md` 與 Bible §6.4、§13 代替（T-185）。

## 4. 裝備系統規劃（防具＋武器變體）

### 現況
- 武器是 7 種固定的**類型**（拳、短刀、劍、大劍、法杖、斧、巨斧），不是背包裡的道具；職業決定能用哪幾種（`classes.json`）。
- 存檔只記 `loadout: { weapon, heroClass }`。
- 唯一有被動效果的道具 `water_charm`，效果寫死在 `Player.tsx`，規格 §7.4 不允許這種做法。

### 目標
規格的三件裝備（螢晶短劍、螢苔法杖、守林者護腕），加上之後各章的裝備，都由**同一套資料驅動的裝備系統**處理，數值與效果在 `game-core` 計算，場景不寫死。

### 設計
1. **裝備欄位**：三格，`weapon`（武器）、`armor`（防具）、`charm`（飾品）。第二章只會用到武器與防具；`water_charm` 搬進飾品欄，讓舊的寫死效果改走同一套系統。
2. **資料**：`items.json` 新增類別 `equipment` 與欄位 `equip`：

   ```jsonc
   {
     "id": "armor_forestkeeper_bracer",
     "category": "equipment",
     "maxStack": 1,
     "equip": {
       "slot": "armor",
       "stats": { "damageTakenScale": 0.9 },
       "effects": [
         { "kind": "mistDamageScale", "value": 0.5 },
         { "kind": "rareDropBonus", "value": 0.15 }
       ]
     }
   }
   ```

   - 武器變體多一個 `base`（原本的武器類型，例如螢晶短劍的 `base` 是 `knife`）。職業不能用這個類型就不能裝備；招式與動畫沿用原本的類型，只改數值與外觀（顏色、拖尾），另外可以有特殊效果（光刃、命中發光植物啟動機關）。
   - 效果種類先定義用得到的：`damageTakenScale`（受到的傷害倍率）、`mistDamageScale`（迷霧持續傷害倍率）、`rareDropBonus`（掉落表中標為 `rare` 的項目機率加成）、`waterBreath`（現有 `water_charm`）；武器的 `starCharge`（光刃）、`plantActivate`（法杖命中發光植物）在做那兩把武器時再加。
3. **狀態與存檔**：`GameState.player.equipment = { weapon?, armor?, charm? }`，存的是道具 id；裝備中的道具留在背包，但不能賣、不能交給任務。存檔升一版（v18 已由 12A 使用，屆時的下一版）：`loadout.equipment`；遷移時全部空白，背包裡有 `water_charm` 的自動放進飾品欄，舊存檔的行為不變。
4. **規則**（`authority/rules.ts`）：
   - 新指令 `EquipItem` / `UnequipItem`：檢查擁有、欄位相符、職業可用。
   - 純函式 `equipmentModifiers(state, items)`：把三格的數值與效果合併成一份倍率。
   - 套用位置：`enemyStrike` 的扣血（目前唯一的受傷入口）、之後的迷霧持續傷害、採集與擊殺的 `rollLoot`。
   - 卸下武器變體時回到職業的一般武器。
5. **介面**：背包加三個裝備格，道具說明顯示數值與效果；在聚落工作台製作（`crafting.json`）。
6. **外觀**：防具第一版**不會顯示在角色身上**（KayKit 角色沒有護腕可以掛）；武器變體用原本的模型換顏色與拖尾。
7. **多人**：裝備屬於個人。對方本來就看得到武器（`PlayerState.weapon`），防具看不到，所以協定不用改；伺服器驗證等伺服器權威（T-169）時再做。
8. **測試**：Vitest 測裝備規則、倍率合併、存檔遷移、`water_charm` 行為不變；e2e 測「製作 → 裝備 → 受到的傷害下降」。

### 時程
規格 Phase 2「完成基本道具與裝備流程」：做聚落工作台時一起做裝備系統與守林者護腕的減傷、稀有掉落；**迷霧持續傷害到 Phase 3（迷霧深層）才有**，護腕的迷霧效果在那時才看得到作用。

## 5. Phase 1 垂直切片：任務拆分與檔案變更計畫

規格 Phase 1 的範圍：迷霧入口、螢苔花園一小部分、一種採集素材、螢苔史萊姆、一座星光燈柱、一個完整任務、存檔與讀檔。依「單次只做一個可驗收功能」拆成五個任務（暫定編號 Phase 12，GAME_DESIGN §9 的「第二章改版」）：

| 任務 | 內容 | 主要檔案 | 驗收 |
|---|---|---|---|
| **12A 移除舊螢苔祕林、存檔 v18** | 從資料移除舊任務、苔咚、三種森林怪、水道、舊區域；琳娜回晨曦村（送信改在村裡交）；奇奇只留在澄鏡湖；澄鏡湖入口的過渡條件；v17 → v18 遷移（舊森林任務與機關重置、站在舊祕林的玩家移到入口） | `data/quests.json`、`enemies.json`、`spawners.json`、`placements.json`、`prefabs.json`、`npcs.json`、`dialogues.json`、`waterways.json`、`game-core/world/types.ts`、`save/schema.ts`、`save/migrate.ts`、移除 `MossThump.tsx`、`waterway*`、相關測試與 e2e | `pnpm check`、`build`；遷移測試；`letters`、`mirrorlake`、`lakequest`、`lightpuzzle`、`save` e2e |
| **12B 新地形：迷霧入口＋螢苔花園一角** | 新區域 ID、`glowmossTerrain.ts` 改寫、`gen-glowmoss.ts` 產生 A 區（石拱門、破損路牌、第一個寶箱）與 B 區一角（螢光花、巨型蘑菇）；規格色票 | `glowmossTerrain.ts`、`scripts/gen-glowmoss.ts`、`regions.json`、`render/forestModels.ts`、`terrainMaterial.ts` | `glowmoss` e2e 改寫（抵達、邊界、區域）；截圖 |
| **12C 星光燈柱與純淨螢苔** | `star_lamp`（未啟動 / 可互動 / 已點亮三態，消耗純淨螢苔，點亮後該區迷霧降一段）、`glowmoss_node` 採集點、`pure_glowmoss` 道具與圖示 | `prefabs.json`、`items.json`、`lootTables.json`、`types.ts`（第三狀態）、`ItemIcon.tsx`、i18n | Vitest（素材不足、不重複消耗）；e2e（點亮、存讀檔後保持） |
| **12D 螢苔史萊姆** | `mob_moss_slime`（GreenBlob 換色、跳撞、黏液、分裂）；A / B 區生成點；掉落螢苔凝膠、微光孢子 | `enemies.json`、`spawners.json`、`items.json`、`lootTables.json`、`CritterEnemy.tsx` | Vitest；`forestmobs` e2e 改寫 |
| **12E 莉露與 `quest_forest_001`「失去光芒的森林」** | 莉露（placeholder 模型，標註）、接任務 → 採集 → 點亮第一座燈柱 → 回報 → 星光羅盤（只給道具，指引功能之後做）；Phase 1 驗收：完整流程 ＋ 存讀檔 | `npcs.json`、`dialogues.json`、`quests.json`、i18n | `forestquest` e2e 改寫；截圖；`perf.mjs`（階段驗收） |

規格 §15 的完成標準：玩家能進入、探索、戰鬥、採集、啟動機關、完成任務並保存進度。12E 驗收後才進入 Phase 2（溪谷、聚落、裝備系統）。

## 6. 要決定的事（2026-10-20 已決定：全部採用建議，T-187）

1. **過渡期間澄鏡湖怎麼進去**：12A 移除舊任務之後，`quest_forest_008` 要到 Phase 4 才存在。
   - 選項 A（建議）：過渡期間澄鏡湖入口只要求第一章完成（`quest_dawn_003`），標註為暫時，第二章做完再改成 `quest_forest_008`。之後的章節一直可以測、可以玩。
   - 選項 B：過渡期間關閉澄鏡湖入口，只能用除錯指令過去。
2. **在哪個分支做**：建議開 `wip/ch2-glowmoss`，12A–12E 完成、Phase 1 驗收後再合回 `develop`。舊祕林移除後到新祕林能玩之前，`develop` 上的螢苔祕林是空的。
3. **新角色與怪物的模型**：開發期先用 placeholder（標註）；正式模型要找 CC0 素材包或做程式造型。可以等 Phase 1 驗收時再決定。
4. **裝備系統（§4）**：三個欄位（武器、防具、飾品），`water_charm` 搬進飾品欄，這樣可以嗎？
