# Mistwood 專案指示

- 開發規格：`GAME_DESIGN.md`（v3，優先依此）；世界觀與內容：`Mistwood_World_Bible_v2.md`；舊整合規格 `mistwood_dev_spec_final.md` 僅作歷史參考
- 技術做法：skill `r3f-game-dev-spec`
- 進度與續作：`docs/PROGRESS.md`（每次任務開始先讀、結束時更新）
- 決策紀錄：`docs/DECISIONS.md`；資產授權：`docs/ASSETS.md`；效能量測：`docs/PERF.md`

規則：單次只做一個可驗收功能。完成前必須通過 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e`；涉及畫面者執行 `node scripts/screenshot.mjs <階段> [--anim] [--mist] [--interact] [--menu] [--harvest] [--region] [--npc] [--lake] [--combat] [--companion] [--build] [--tavern] [--gamepad] [--ambient] [--bounds] [--daynight] [--melee] [--magic] [--map]` 並實際檢視截圖；效能量測用 `node scripts/perf.mjs`（有視窗、實機 GPU，量測時不要操作電腦）。`pnpm e2e` 含開發模式（StrictMode）的實際操作測試。
