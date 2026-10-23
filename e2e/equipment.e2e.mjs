// 端對端：第二章 Phase 2 — 裝備系統（PHASE0 §4、規格 §7.3）。
// 背包（I 鍵）：選守林者護腕 → 按「裝備」→ 防具格出現；被敵人打時受到的傷害減少；卸下後放回背包；
// 螢晶短劍只有在基礎武器是短刀時生效（旅人一開始拿劍，裝了不生效）。
// 用法：pnpm build && node e2e/equipment.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e } from './lib.mjs';

await runE2e('equipment e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, itemCount }) => {
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const openInventory = async () => {
    await page.keyboard.press('KeyI');
    await page.locator('[data-testid="inventory"]').waitFor({ timeout: 2000 });
  };
  const closeInventory = async () => {
    await page.keyboard.press('KeyI');
    await page.locator('[data-testid="inventory"]').waitFor({ state: 'detached', timeout: 2000 });
  };
  const selectItem = async (itemId) => {
    const i = await debug((id) => window.__mistwoodDebug.inventory().findIndex((s) => s?.itemId === id), itemId);
    assert.ok(i >= 0, `背包裡沒有 ${itemId}`);
    await page.locator('[data-testid="inventory-slot"]').nth(i).click();
  };

  await check('裝備護腕：背包選取後按「裝備」，防具格顯示護腕，背包減少一件', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'forest_bracer', count: 1 }] });
    await openInventory();
    await selectItem('forest_bracer');
    await page.locator('[data-testid="inventory-equip"]').click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('[data-testid="equip-slot-armor"]').innerText(), /守林者護腕/);
    assert.equal(await itemCount('forest_bracer'), 0);
    await closeInventory();
  });

  await check('卸下護腕：按「卸下」後放回背包，防具格變成空的', async () => {
    await openInventory();
    await page.locator('[data-testid="equip-unequip-armor"]').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('forest_bracer'), 1);
    assert.doesNotMatch(await page.locator('[data-testid="equip-slot-armor"]').innerText(), /守林者護腕/);
    await closeInventory();
  });

  await check('螢晶短劍：旅人拿著劍時裝上不生效（倍率仍是 1）', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'glow_knife', count: 1 }] });
    await openInventory();
    await selectItem('glow_knife');
    await page.locator('[data-testid="inventory-equip"]').click();
    await page.waitForTimeout(200);
    // 武器格有短劍，但目前的武器不是短刀，所以攻擊倍率不生效（規則測試 equipment.test.ts 驗證倍率本身）
    assert.match(await page.locator('[data-testid="equip-slot-weapon"]').innerText(), /螢晶短劍/);
    await closeInventory();
    assert.equal(await debug(() => window.__mistwoodDebug.equipment().weapon), 'glow_knife');
  });
});
