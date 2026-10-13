// 端對端：任務 2E — 設定畫面：按鍵重新配置（衝突、取消、還原）、在遊戲中生效、提示文字跟著改、重開後保留。
// 用法：pnpm build && node e2e/settings.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, runE2e, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const chest = placements.find((p) => p.prefabId === 'chest_wood');

await runE2e('settings e2e（1/2）', { query: 'debug=1', env }, async ({ page, check, debug, teleport, objectState }) => {
  const settings = page.locator('[data-testid="settings"]');
  const bind = (action, slot) => page.locator(`[data-testid="bind-${action}-${slot}"]`);

  await check('主選單「設定」開啟設定畫面，顯示目前按鍵', async () => {
    await page.locator('[data-testid="title-settings"]').click();
    await settings.waitFor({ timeout: 3000 });
    assert.equal(await bind('interact', 0).innerText(), 'E');
    assert.equal(await bind('moveForward', 1).innerText(), '↑');
  });

  await check('點選後按 F：互動改為 F', async () => {
    await bind('interact', 0).click();
    assert.match(await bind('interact', 0).innerText(), /請按下/);
    await page.keyboard.press('KeyF');
    assert.equal(await bind('interact', 0).innerText(), 'F');
  });

  await check('等待按鍵時按 Esc 只取消，不關閉設定畫面', async () => {
    await bind('jump', 0).click();
    await page.keyboard.press('Escape');
    assert.equal(await bind('jump', 0).innerText(), '空白鍵');
    assert.equal(await settings.count(), 1);
  });

  await check('指定已被使用的按鍵：從原本的動作移除並提示', async () => {
    await bind('skill', 0).click();
    await page.keyboard.press('KeyI');
    assert.equal(await bind('skill', 0).innerText(), 'I');
    assert.equal(await bind('inventory', 0).innerText(), 'Tab');
    assert.match(await page.locator('[data-testid="settings-notice"]').innerText(), /背包/);
  });

  await check('Esc 關閉設定畫面', async () => {
    await page.keyboard.press('Escape');
    await settings.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('新遊戲：提示文字與互動提示顯示 F，按 F 開寶箱、按 E 沒有作用', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 3000 });
    assert.match(await page.locator('[data-testid="tutorial"]').innerText(), /W A S D/);
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4);
    const prompt = page.locator('[data-testid="interact-prompt"]');
    await prompt.waitFor({ timeout: 3000 });
    assert.match(await prompt.innerText(), /^F/);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.equal(await objectState(chest.id), null, '按 E 也打開了寶箱');
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(900);
    assert.equal((await objectState(chest.id))?.open, true);
  });

  await check('暫停 →「設定」→ Esc 只關閉設定，暫停選單仍在', async () => {
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.locator('[data-testid="pause-settings"]').click();
    await settings.waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await settings.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 1);
  });
});

await runE2e('settings e2e（2/2 重開）', { query: 'debug=1', env }, async ({ page, check }) => {
  const bind = (action, slot) => page.locator(`[data-testid="bind-${action}-${slot}"]`);
  await check('重開後按鍵設定保留', async () => {
    await page.locator('[data-testid="title-settings"]').click();
    assert.equal(await bind('interact', 0).innerText(), 'F');
    assert.equal(await bind('skill', 0).innerText(), 'I');
  });

  await check('還原預設按鍵', async () => {
    await page.locator('[data-testid="settings-reset-keys"]').click();
    assert.equal(await bind('interact', 0).innerText(), 'E');
    assert.equal(await bind('inventory', 0).innerText(), 'I');
    assert.equal(await page.locator('[data-testid="settings-notice"]').count(), 0);
  });
});
