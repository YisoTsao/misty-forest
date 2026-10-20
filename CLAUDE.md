# Mistwood 專案指示

- 開發規格：`GAME_DESIGN.md`（v3，優先依此）；世界觀與內容：`Mistwood_World_Bible_v2.md`；舊整合規格 `mistwood_dev_spec_final.md` 僅作歷史參考
- 第二章（螢苔祕林）規格書：`docs/CHAPTER_02_GLOWMOSS_WOOD_SPEC.md`（內容已整理進 Bible §6；測試、開發階段與技術規則以規格書為準）；參考圖 `docs/art/reference/螢苔祕林/`（不進版控）
- 技術做法：skill `r3f-game-dev-spec`
- 進度與續作：`docs/PROGRESS.md`（每次任務開始先讀、結束時更新）
- 決策紀錄：`docs/DECISIONS.md`；資產授權：`docs/ASSETS.md`；效能量測：`docs/PERF.md`

規則：單次只做一個可驗收功能。驗證依「分層驗證」執行（詳見 skill `mistwood-verify`）：
- 每次改動：`pnpm vitest related <檔案> --run`
- 任務完成前必過：`pnpm check`、`pnpm build`
- e2e（48 個 suite，每個都會啟動 Electron；`multiplayer` 另外會啟動遊戲伺服器）：依 skill `mistwood-verify` 的對照表只跑改動範圍的 suite，不整組跑；純 game-core、資料、文件不跑
- 收尾、push 前跑一次完整 `pnpm e2e`（會先 build），並在 PROGRESS.md 記錄結果
- 截圖只拍受影響的書籤：`node scripts/screenshot.mjs <階段> <書籤...> [--flag]`，不重拍整組
- 效能量測（perf.mjs）只在階段驗收或改到渲染負載時跑

## 語言與回應規範
- 必須始終使用「繁體中文（Traditional Chinese / zh-TW）」進行溝通與回應。
- 註解、Commit Message 與文件更新若無特別指定，一律使用繁體中文。