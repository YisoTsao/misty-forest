// 端對端：任務 7F — 任務日誌（Bible §31.2）。
// J 開關（Esc 也能關，不會打開暫停選單）、開著時角色不動；進行中 / 可接取 / 已完成三個分頁與內容（發起人、目標進度、獎勵）；
// 「在地圖上查看」打開世界地圖；暫停選單也能開。
// 用法：pnpm build && node e2e/journal.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e } from './lib.mjs';

await runE2e('journal e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, state }) => {
  const journal = page.getByTestId('quest-journal');
  const detail = page.getByTestId('journal-detail');

  await debug(() => {
    const d = window.__mistwoodDebug;
    d.setQuestCompleted('wood_for_bridge');
    d.send({ type: 'AcceptQuest', quest: 'repair_bridge' });
  });

  await check('按 J 打開任務日誌；開著時按 W 角色不動', async () => {
    await page.keyboard.press('KeyJ');
    await journal.waitFor({ timeout: 2000 });
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.05, '日誌開著時角色移動了');
  });

  await check('進行中：一座橋的距離（主線）、發起人、修理目標與材料、獎勵、地圖標記', async () => {
    await page.getByTestId('journal-tab-active').click();
    assert.match(await detail.innerText(), /主線/);
    assert.match(await page.getByTestId('journal-quest-name').innerText(), /.+/);
    const text = await detail.innerText();
    assert.match(text, /發起人：/);
    assert.match(text, /晨曦谷地/);
    assert.match(text, /目前目標/);
    assert.ok((await page.getByTestId('journal-rewards').count()) === 1);
    assert.match(text, /主線任務一定會顯示在畫面上/);
    assert.equal(await page.getByTestId('journal-track').count(), 0);
  });

  await check('已完成分頁列出完成的任務；可接取分頁提示去找誰', async () => {
    await page.getByTestId('journal-tab-completed').click();
    assert.ok((await page.locator('[data-testid="journal-entry"][data-quest="wood_for_bridge"]').count()) === 1);
    await page.getByTestId('journal-tab-available').click();
    const entries = await page.getByTestId('journal-entry').count();
    if (entries > 0) assert.match(await detail.innerText(), /聊聊/);
    else assert.match(await page.getByTestId('journal-list').innerText(), /四處走走/);
  });

  await check('「在地圖上查看」關閉日誌、打開世界地圖', async () => {
    await page.getByTestId('journal-tab-active').click();
    await page.getByTestId('journal-show-map').click();
    await page.getByTestId('world-map').waitFor({ timeout: 2000 });
    assert.equal(await journal.count(), 0);
    await page.keyboard.press('Escape');
    await page.getByTestId('world-map').waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('Esc 關閉日誌，不會打開暫停選單；暫停選單也能開日誌', async () => {
    await page.keyboard.press('KeyJ');
    await journal.waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await journal.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('pause-journal').count(), 0, '暫停選單被打開了');
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-journal').waitFor({ timeout: 2000 });
    await page.getByTestId('pause-journal').click();
    await journal.waitFor({ timeout: 2000 });
  });
});
