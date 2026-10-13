# 資產來源與授權

未確認授權的資產不得進入正式發行版本（規格 4.7）。

| 名稱 | 路徑 | 來源 | 授權 | 商業使用 | 修改／再散布 | 用途 | 狀態 |
|---|---|---|---|---|---|---|---|
| 旅人角色（Rogue_Hooded） | `public/models/characters/kaykit-adventurers/Rogue_Hooded.glb` | KayKit Character Pack: Adventurers 1.0，Kay Lousberg（www.kaylousberg.com）；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名，建議於製作名單致謝） | 玩家角色與動畫 | 正式使用 |
| 近戰武器：Rogue_Hooded 的 `Knife` / `Knife_Offhand`、Knight 的 `1H_Sword` 節點 | `public/models/characters/kaykit-adventurers/` | 同旅人角色（KayKit Adventurers 1.0） | CC0 1.0 | 可 | 可（不強制署名） | 玩家的短刀（雙刀）與單手劍（任務 6C，劍從 Knight.glb 複製後掛到玩家右手） | 正式使用 |
| 村莊 NPC（Mage、Barbarian、Knight、Rogue） | `public/models/characters/kaykit-adventurers/` | KayKit Character Pack: Adventurers 1.0（同旅人角色） | CC0 1.0 | 可 | 可（不強制署名） | 村長米菈、木匠波木、守衛雷歐、酒館老闆茉莉（與玩家共用骨架與動畫；Bible 的兔族、熊族外型待 Phase 7 換模型） | 正式使用 |
| 建造物：table_medium、chair_A_wood、chair_stool_wood 與共用貼圖 | `public/models/kaykit-furniture/` | KayKit Furniture Bits 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 家園的木桌、木椅、木凳 | 正式使用 |
| 酒館家具：table_medium_long、cabinet_medium_decorated、rug_rectangle_stripes_A | `public/models/kaykit-furniture/` | KayKit Furniture Bits 1.0（同上） | CC0 1.0 | 可 | 可（不強制署名） | 酒館室內的吧台、櫃子、地毯（任務 5B） | 正式使用 |
| 建造物：bench、lantern_standing、pumpkin_orange 與共用貼圖 | `public/models/kaykit-halloween/` | KayKit Halloween Bits 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 家園的長椅、星光燈、南瓜擺飾 | 正式使用 |
| 建造物：building_home_A_green、flag_red | `public/models/kaykit-hexagon/` | KayKit Medieval Hexagon Pack 1.0 | CC0 1.0 | 可 | 可（不強制署名） | 家園的小木屋與旗子 | 正式使用 |
| 樹木（tree_single_A / B）、岩石（rock_single_A / B / C）與共用貼圖 `hexagons_medieval.png` | `public/models/kaykit-hexagon/` | KayKit Medieval Hexagon Pack 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 草原與森林的樹木、岩石 | 正式使用（風格判定後可能替換） |
| 村莊建築：building_home_A_blue / home_A_yellow / home_B_red、tavern_green、well_blue、windmill_red | `public/models/kaykit-hexagon/` | 同上（KayKit Medieval Hexagon Pack 1.0） | CC0 1.0 | 可 | 可（不強制署名） | 小村莊的房屋、酒館、井、風車 | 正式使用 |
| 村莊雜物：fence_wood_straight、barrel、crate_A_big / small、wheelbarrow、resource_lumber、sack、bucket_water | `public/models/kaykit-hexagon/` | 同上 | CC0 1.0 | 可 | 可（不強制署名） | 柵欄牧場、木桶、木箱等生活感細節（規格 4.3） | 正式使用 |
| 樹樁：tree_single_A_cut、tree_single_B_cut | `public/models/kaykit-hexagon/` | 同上（KayKit Medieval Hexagon Pack 1.0） | CC0 1.0 | 可 | 可（不強制署名） | 砍樹後留下的樹樁（任務 2A） | 正式使用 |
| 雲：cloud_big、cloud_small | `public/models/kaykit-hexagon/` | 同上 | CC0 1.0 | 可 | 可（不強制署名） | 天空中緩慢飄移的雲 | 正式使用 |
| 寶箱（chest） | `public/models/props/kaykit-dungeon/chest.glb` | KayKit Dungeon Remastered 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 可互動寶箱（含可動的蓋子節點 `chest_lid`） | 正式使用 |

| 音效（腳步、砍樹、敲石頭、拾取、寶箱、任務、建造、戰鬥、介面等 46 個） | `public/audio/kenney/` | Kenney：RPG Audio、Impact Sounds、Interface Sounds（kenney.nl） | CC0 1.0（授權檔同目錄 `License_*.txt`） | 可 | 可（不強制署名） | 音效（`game/audio/sounds.ts`） | 正式使用 |

程式產生（不需授權）：環境音（風、鳥叫、迷霧嗡鳴、水聲）與背景音樂（Web Audio 合成，`game/audio/audioEngine.ts`）、地形顏色（shader 雜訊）、草叢與花朵幾何、可採集的花叢與草藥、木橋、營火、酒館室內（牆、地板、壁爐）與門墊（`render/proceduralModels.ts`）、迷霧噗啾（迷霧生物）、星光夥伴芽芽、物品圖示（`ui/ItemIcon.tsx` SVG）、遠山環狀山脈與地圖外地面延伸、天空漸層；地圖邊界迷霧牆（任務 6A）；太陽、月亮與月相、星空、螢火蟲、夜晚燈光光暈、蟲鳴（任務 6B）；揮砍拖尾、命中火花與衝擊塵（任務 6C）。

參考圖請放在 `docs/art/reference/`（目前尚未提供）。
