// 端對端：任務 7I — 使用消耗品（Bible §25.3）。
// 背包裡選小瓶草藥水按「使用」回血 → 體力滿時按 X 不浪費藥 → 被泥巴緩速時按 X 自動用月露藥膏、緩速解除 → HUD 的回復藥數量。
// 用法：pnpm build && node e2e/potion.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e } from './lib.mjs';

await runE2e('potion e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, itemCount }) => {
  const hp = () => debug(() => window.__mistwoodDebug.combatState().hp);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const toasts = () => debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));

  await send({ type: 'DebugGiveItems', items: [{ itemId: 'herb_potion', count: 2 }, { itemId: 'moondew_salve', count: 1 }] });

  await check('HUD 顯示回復藥數量與快速鍵', async () => {
    const badge = page.getByTestId('potion-count');
    await badge.waitFor({ timeout: 2000 });
    assert.match(await badge.innerText(), /×3/);
    assert.match(await badge.innerText(), /X/);
  });

  await check('受傷後在背包選小瓶草藥水按「使用」回血', async () => {
    await send({ type: 'DebugSetHp', hp: 40 });
    await page.waitForFunction(() => window.__mistwoodDebug.combatState().hp === 40, null, { timeout: 2000 });
    const hurt = await hp();
    await page.keyboard.press('KeyI');
    await page.getByTestId('inventory').waitFor({ timeout: 2000 });
    await page.locator('[data-testid="inventory-slot"][data-item="herb_potion"]').click();
    await page.getByTestId('inventory-use').click();
    await page.waitForFunction((h) => window.__mistwoodDebug.combatState().hp >= h + 30, hurt, { timeout: 2000 });
    assert.equal(await itemCount('herb_potion'), 1);
    await page.keyboard.press('Escape');
    await page.getByTestId('inventory').waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('體力滿時按 X 不會用掉藥', async () => {
    await send({ type: 'Rest' });
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyX');
    await page.waitForTimeout(400);
    assert.equal(await itemCount('herb_potion'), 1);
    assert.ok((await toasts()).includes('toast.hpFull'));
  });

  await check('被泥巴緩速時按 X 自動用月露藥膏，緩速解除', async () => {
    await debug(() => window.__mistwoodDebug.slowPlayer(5, 0.5));
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining > 0, null, { timeout: 2000 });
    await page.keyboard.press('KeyX');
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining <= 0, null, { timeout: 2000 });
    assert.equal(await itemCount('moondew_salve'), 0);
    assert.equal(await itemCount('herb_potion'), 1);
  });
});
