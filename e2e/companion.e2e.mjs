// 端對端：任務 3F — 星光夥伴「芽芽」：打開序章寶箱後出現並打招呼、跟隨玩家、按 H 依進度給提示、
// 任務可以回報時主動提醒、解鎖狀態存檔（位置不存檔）。
// 用法：pnpm build && node e2e/companion.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e, placements, tempSaveDir } from './lib.mjs';

const chest = placements.find((p) => p.prefabId === 'chest_wood');
const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const bubble = (page) => page.locator('[data-testid="companion-bubble"]');

await runE2e('companion e2e（1/2）', { env }, async ({ page, check, debug, state, camera, teleport }) => {
  const companion = () => debug(() => window.__mistwoodDebug.companion());

  await check('一開始沒有夥伴；按 H 沒有反應', async () => {
    assert.equal((await companion()).unlocked, false);
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(300);
    assert.equal(await bubble(page).count(), 0);
  });

  await check('打開序章寶箱：芽芽解鎖、通知與打招呼泡泡', async () => {
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4);
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="message-dialog"]').waitFor({ timeout: 3000 });
    assert.equal((await companion()).unlocked, true);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'companion.unlocked'), JSON.stringify(toasts));
    await page.keyboard.press('KeyE');
    await bubble(page).waitFor({ timeout: 2000 });
    assert.match(await bubble(page).innerText(), /芽芽/);
  });

  await check('打開寶箱時開始「找到回家的路」；走進晨曦村自動完成（任務 7O）', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_dawn_001')), 'active');
    await teleport(-9, -30, 1200);
    await page.waitForFunction(() => window.__mistwoodDebug.questState('quest_dawn_001') === 'completed', null, { timeout: 4000 });
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4, 800);
  });

  await check('芽芽跟著玩家（跑 4 秒後仍在身邊）', async () => {
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(4000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(1500);
    const p = await state();
    const c = await companion();
    assert.ok(Math.hypot(c.x - p.x, c.z - p.z) < 2, `芽芽離玩家 ${Math.hypot(c.x - p.x, c.z - p.z).toFixed(2)} m`);
    assert.ok(c.y > p.y, '芽芽應該浮在玩家上方');
  });

  await check('按 H 詢問：依進度提示（接了木材任務 → 提示去砍樹）', async () => {
    await debug(() => window.__mistwoodDebug.send({ type: 'AcceptQuest', quest: 'wood_for_bridge' }));
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(300);
    assert.match(await bubble(page).innerText(), /6 根木材/);
  });

  await check('木材湊齊時芽芽主動提醒回去回報', async () => {
    await debug(() => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 6 }] }));
    await page.waitForTimeout(300);
    assert.match(await bubble(page).innerText(), /木材夠了/);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
  });
});

await runE2e('companion e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, state }) => {
  await check('繼續遊戲後芽芽仍在，出現在玩家身邊（位置不存檔）', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(800);
    const c = await debug(() => window.__mistwoodDebug.companion());
    const p = await state();
    assert.equal(c.unlocked, true);
    assert.ok(Math.hypot(c.x - p.x, c.z - p.z) < 2, '讀檔後芽芽沒有在玩家身邊');
  });
});
