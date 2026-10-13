# 資產來源與授權

未確認授權的資產不得進入正式發行版本（規格 4.7）。

| 名稱 | 路徑 | 來源 | 授權 | 商業使用 | 修改／再散布 | 用途 | 狀態 |
|---|---|---|---|---|---|---|---|
| 旅人角色（Rogue_Hooded） | `public/models/characters/kaykit-adventurers/Rogue_Hooded.glb` | KayKit Character Pack: Adventurers 1.0，Kay Lousberg（www.kaylousberg.com）；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名，建議於製作名單致謝） | 玩家角色與動畫 | 正式使用 |
| 樹木（tree_single_A / B）、岩石（rock_single_A / B / C）與共用貼圖 `hexagons_medieval.png` | `public/models/kaykit-hexagon/` | KayKit Medieval Hexagon Pack 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 草原與森林的樹木、岩石 | 正式使用（風格判定後可能替換） |
| 村莊建築：building_home_A_blue / home_A_yellow / home_B_red、tavern_green、well_blue、windmill_red | `public/models/kaykit-hexagon/` | 同上（KayKit Medieval Hexagon Pack 1.0） | CC0 1.0 | 可 | 可（不強制署名） | 小村莊的房屋、酒館、井、風車 | 正式使用 |
| 村莊雜物：fence_wood_straight、barrel、crate_A_big / small、wheelbarrow、resource_lumber、sack、bucket_water | `public/models/kaykit-hexagon/` | 同上 | CC0 1.0 | 可 | 可（不強制署名） | 柵欄牧場、木桶、木箱等生活感細節（規格 4.3） | 正式使用 |
| 樹樁：tree_single_A_cut、tree_single_B_cut | `public/models/kaykit-hexagon/` | 同上（KayKit Medieval Hexagon Pack 1.0） | CC0 1.0 | 可 | 可（不強制署名） | 砍樹後留下的樹樁（任務 2A） | 正式使用 |
| 雲：cloud_big、cloud_small | `public/models/kaykit-hexagon/` | 同上 | CC0 1.0 | 可 | 可（不強制署名） | 天空中緩慢飄移的雲 | 正式使用 |
| 寶箱（chest） | `public/models/props/kaykit-dungeon/chest.glb` | KayKit Dungeon Remastered 1.0，Kay Lousberg；取自 [GitHub](https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0) | CC0 1.0（授權檔同目錄 `LICENSE.txt`） | 可 | 可（不強制署名） | 可互動寶箱（含可動的蓋子節點 `chest_lid`） | 正式使用 |

程式產生（不需授權）：地形顏色（shader 雜訊）、草叢與花朵幾何、可採集的花叢與草藥（`render/proceduralModels.ts`）、物品圖示（`ui/ItemIcon.tsx` SVG）、遠山環狀山脈與地圖外地面延伸、天空漸層。

參考圖請放在 `docs/art/reference/`（目前尚未提供）。
