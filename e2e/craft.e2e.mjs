// 端對端：任務 7J — 琳娜的草藥桌（Bible §26.1–26.2）。
// 琳娜的任務完成後，對話選「借用草藥桌」開啟 → 材料不足時顯示還缺多少、按鈕停用 → 補齊材料製作小瓶草藥水 → 月露藥膏配方已解鎖 → Esc 關閉。
// 用法：pnpm build && node e2e/craft.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));

await runE2e('craft e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const panel = page.getByTestId('craft');
  const row = (id) => page.locator(`[data-testid="craft-row"][data-recipe="${id}"]`);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);

  await debug(() => {
    const d = window.__mistwoodDebug;
    for (const q of ['wood_for_bridge', 'repair_bridge', 'quest_forest_001']) d.setQuestCompleted(q);
    d.travelToMap('glowmoss');
  });
  await page.waitForFunction(() => window.__mistwoodDebug.currentMap().shown === 'glowmoss', null, { timeout: 4000 });
  await page.waitForTimeout(1000);

  await check('和琳娜對話選「借用草藥桌」開啟工作台', async () => {
    const n = npcs.find((x) => x.id === 'linna');
    await teleport(n.position[0] + Math.sin(n.facingYaw) * 1.8, n.position[1] + Math.cos(n.facingYaw) * 1.8, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), n.position);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:linna', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    await page.locator('[data-testid="dialogue-option"]', { hasText: '借用草藥桌' }).click();
    await panel.waitFor({ timeout: 2000 });
    assert.equal(await row('recipe_moondew_balm').count(), 1, '月露藥膏配方應已解鎖');
  });

  await check('材料不足：顯示還缺多少、按鈕停用', async () => {
    const r = row('recipe_small_heal');
    assert.equal(await r.getByTestId('craft-make').isDisabled(), true);
    assert.match(await r.getByTestId('craft-missing').innerText(), /還缺：月露草 ×2/);
  });

  await check('補齊材料後製作小瓶草藥水', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'moondew_herb', count: 2 }, { itemId: 'herb', count: 1 }] });
    await page.waitForTimeout(200);
    const before = await itemCount('herb_potion');
    await row('recipe_small_heal').getByTestId('craft-make').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('herb_potion'), before + 1);
    assert.equal(await itemCount('moondew_herb'), 0);
    assert.equal(await row('recipe_small_heal').getByTestId('craft-make').isDisabled(), true);
  });

  await check('Esc 關閉工作台，不會打開暫停選單', async () => {
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('pause-journal').count(), 0);
  });
});
