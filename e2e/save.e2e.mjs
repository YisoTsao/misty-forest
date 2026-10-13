// 端對端：任務 2C — 存檔框架。以同一個存檔資料夾重複啟動遊戲，驗證：
// 存檔 → 關閉 → 重開「繼續遊戲」後背包、採集狀態、寶箱、玩家位置、設定都還在；自動存檔；匯出；
// 主檔損壞時從備份還原；主檔與備份都損壞時仍可啟動並開始新遊戲；網頁開發模式的 IndexedDB 存檔。
// 用法：pnpm build && node e2e/save.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, standSouthOf, tempSaveDir } from './lib.mjs';

const saveDir = tempSaveDir();
const userData = tempSaveDir();
const env = { MISTWOOD_SAVE_DIR: saveDir, MISTWOOD_USER_DATA_DIR: userData };
const primary = path.join(saveDir, 'slot1.json');
const backup = path.join(saveDir, 'slot1.bak.json');
const tree = placements.find((p) => p.id === 'meadow_tree_001');
const chest = placements.find((p) => p.prefabId === 'chest_wood');
const SAVED_AT = { x: -6, z: 30 };
let expected = null;

const title = (page) => page.locator('[data-testid="title-screen"]');

// 第 1 次啟動：新遊戲 → 採集、開箱、走到別處、改畫質 → 手動存檔
await runE2e('save e2e（1/5 存檔）', { query: 'debug=1', env }, async ({ page, check, debug, state, teleport, objectState, itemCount }) => {
  await check('沒有存檔時主選單只有「新遊戲」', async () => {
    await page.locator('[data-testid="title-start"]').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('[data-testid="title-continue"]').count(), 0);
  });

  await check('新遊戲 → 砍樹、開寶箱 → 改畫質為低 → 暫停選單「儲存遊戲」', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 3000 });
    await teleport(...standSouthOf(tree, 1.5));
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    await debug((id) => window.__mistwoodDebug.send({ type: 'OpenChest', placementId: id }), chest.id);
    await teleport(SAVED_AT.x, SAVED_AT.z);
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.locator('[data-testid="pause-settings"]').click();
    await page.locator('[data-testid="settings"] [data-testid="quality-low"]').click();
    await page.locator('[data-testid="settings-close"]').click();
    await page.locator('[data-testid="pause-save"]').click();
    await page.locator('[data-testid="save-status"]', { hasText: '已儲存' }).waitFor({ timeout: 3000 });
    expected = {
      wood: await itemCount('wood'),
      shard: await itemCount('starlight_shard'),
      tree: await objectState(tree.id),
      player: await state(),
    };
    assert.ok(expected.wood >= 2 && expected.shard === 1 && expected.tree?.harvested, JSON.stringify(expected));
    const file = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(file.version, 3);
    assert.equal(typeof file.tutorial, 'string');
    assert.ok(file.world.objects.some((o) => o.placementId === chest.id && o.open), '存檔內沒有寶箱狀態');
  });

  await check('匯出存檔內容與存檔檔案相同', async () => {
    const exported = await debug(() => window.__mistwoodDebug.exportSave());
    assert.deepEqual(JSON.parse(exported), JSON.parse(readFileSync(primary, 'utf8')));
  });
});

// 第 2 次啟動：繼續遊戲 → 狀態全部還原；自動存檔
await runE2e('save e2e（2/5 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, state, teleport, objectState, itemCount, interactTarget }) => {
  await check('主選單顯示「繼續遊戲」與存檔時間、遊玩時間；畫質設定已還原為低', async () => {
    const info = page.locator('[data-testid="title-save-info"]');
    await info.waitFor({ timeout: 5000 });
    assert.match(await info.innerText(), /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}.*遊玩/);
    assert.equal((await debug(() => window.__mistwoodDebug.settings())).quality, 'low');
  });

  await check('繼續遊戲：背包、樹樁、寶箱狀態與玩家位置都還在', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);
    assert.equal(await itemCount('wood'), expected.wood);
    assert.equal(await itemCount('starlight_shard'), 1);
    assert.deepEqual(await objectState(tree.id), expected.tree);
    assert.equal((await objectState(chest.id))?.open, true);
    const s = await state();
    assert.ok(Math.hypot(s.x - SAVED_AT.x, s.z - SAVED_AT.z) < 0.3, `位置 (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
    assert.ok(s.grounded, '讀檔後沒有站在地面上');
  });

  await check('已開的寶箱讀檔後仍不能重複領取', async () => {
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4);
    await page.waitForTimeout(300);
    assert.notEqual(await interactTarget(), chest.id);
    await debug((id) => window.__mistwoodDebug.send({ type: 'OpenChest', placementId: id }), chest.id);
    assert.equal(await itemCount('starlight_shard'), 1);
  });

  await check('採集後約 2 秒自動存檔，上一版成為備份', async () => {
    const before = statSync(primary).mtimeMs;
    const flower = placements.find((p) => p.id === 'meadow_flower_001');
    await teleport(...standSouthOf(flower, 1.1));
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(3500);
    assert.ok(statSync(primary).mtimeMs > before, '沒有自動存檔');
    const file = JSON.parse(readFileSync(primary, 'utf8'));
    assert.ok(file.world.objects.some((o) => o.placementId === flower.id && o.harvested));
    const bak = JSON.parse(readFileSync(backup, 'utf8'));
    assert.ok(!bak.world.objects.some((o) => o.placementId === flower.id), '備份不是上一版');
  });
});

// 第 3 次啟動：主檔損壞 → 從備份還原
writeFileSync(primary, '{"version": 1, "world": 壞掉的存檔');
await runE2e('save e2e（3/5 主檔損壞）', { query: 'debug=1', env }, async ({ page, check, debug, objectState }) => {
  await check('主檔損壞時仍顯示「繼續遊戲」（備份可用）；繼續後顯示已從備份還原', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 5000 });
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'save.restoredFromBackup'), JSON.stringify(toasts));
    assert.equal((await objectState(tree.id))?.harvested, true, '備份內容沒有還原');
  });
});

// 第 4 次啟動：主檔與備份都損壞 → 仍可啟動、顯示提示、可開始新遊戲
writeFileSync(primary, 'garbage');
writeFileSync(backup, '{"version": 999}');
await runE2e('save e2e（4/5 全部損壞）', { query: 'debug=1', env }, async ({ page, check, itemCount }) => {
  await check('主選單顯示存檔損壞提示、沒有「繼續遊戲」、沒有錯誤畫面', async () => {
    await page.locator('[data-testid="title-save-corrupt"]').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('[data-testid="title-continue"]').count(), 0);
    assert.equal(await page.locator('[role="alert"]').count(), 0);
  });

  await check('可以開始新遊戲，背包是空的', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 3000 });
    assert.equal(await itemCount('wood'), 0);
  });
});

// 第 5 次：網頁開發模式的 IndexedDB 存檔（同介面），跨重新啟動保留
const idbEnv = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
await runE2e('save e2e（5/5 IndexedDB）', { query: 'debug=1&storage=indexeddb', env: idbEnv }, async ({ page, check, debug, teleport, itemCount }) => {
  await check('IndexedDB：新遊戲 → 採集 → 回主選單時自動存檔', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 3000 });
    await teleport(...standSouthOf(tree, 1.5));
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.locator('[data-testid="pause-to-title"]').click();
    await page.locator('[data-testid="title-continue"]').waitFor({ timeout: 5000 });
    assert.ok((await itemCount('wood')) >= 2);
    assert.equal(statSync(idbEnv.MISTWOOD_SAVE_DIR).isDirectory(), true);
    assert.throws(() => statSync(path.join(idbEnv.MISTWOOD_SAVE_DIR, 'slot1.json')), '不應寫到檔案存檔');
  });
});
await runE2e('save e2e（5/5 IndexedDB 重開）', { query: 'debug=1&storage=indexeddb', env: idbEnv }, async ({ page, check, objectState }) => {
  await check('IndexedDB：重開後可繼續遊戲，樹樁還在', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await title(page).waitFor({ state: 'detached', timeout: 5000 });
    assert.equal((await objectState(tree.id))?.harvested, true);
  });
});
