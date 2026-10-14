// 端對端：任務 7H — 米菈的雜貨補給（Bible §26.3）。
// 和米菈對話選「看看補給品」開店 → 開著時角色不動 → 出售木材換種籽幣 → 購買小瓶草藥水（扣幣、背包增加）→ 錢不夠時按鈕停用 → Esc 關閉（不開暫停選單）。
// 用法：pnpm build && node e2e/shop.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const shops = JSON.parse(readFileSync('src/data/shops.json', 'utf8'));
const mira = shops.find((s) => s.id === 'shop_mira_supply');
const price = (list, id) => mira[list].find((e) => e.itemId === id).price;

await runE2e('shop e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, state }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const shop = page.getByTestId('shop');
  const row = (id) => page.locator(`[data-testid="shop-row"][data-item="${id}"]`);

  await debug(() => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 10 }] }));

  await check('和米菈對話選「看看補給品」開店；開著時角色不動', async () => {
    const n = npcs.find((x) => x.id === 'elder');
    await teleport(n.position[0] + Math.sin(n.facingYaw) * 1.8, n.position[1] + Math.cos(n.facingYaw) * 1.8, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), n.position);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:elder', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    for (let i = 0; i < 6 && (await page.locator('[data-testid="dialogue-option"]', { hasText: '看看補給品' }).count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    await page.locator('[data-testid="dialogue-option"]', { hasText: '看看補給品' }).click();
    await shop.waitFor({ timeout: 2000 });
    assert.equal(await box.count(), 0);
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.05);
  });

  await check('出售 3 塊木材換種籽幣', async () => {
    await page.getByTestId('shop-tab-sell').click();
    const r = row('wood');
    for (let i = 0; i < 2; i++) await r.getByRole('button', { name: '+' }).click();
    await r.getByTestId('shop-trade').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('wood'), 7);
    assert.equal(await itemCount('seed_coin'), price('buys', 'wood') * 3);
  });

  await check('錢不夠時購買按鈕停用；給錢後買小瓶草藥水', async () => {
    await page.getByTestId('shop-tab-buy').click();
    assert.equal(await row('herb_potion').getByTestId('shop-trade').isDisabled(), true);
    await debug(() => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: [{ itemId: 'seed_coin', count: 30 }] }));
    await page.waitForTimeout(200);
    const coins = await itemCount('seed_coin');
    await row('herb_potion').getByTestId('shop-trade').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('herb_potion'), 1);
    assert.equal(await itemCount('seed_coin'), coins - price('stock', 'herb_potion'));
    assert.match(await page.getByTestId('shop-coins').innerText(), new RegExp(String(coins - price('stock', 'herb_potion'))));
  });

  await check('Esc 關閉商店，不會打開暫停選單', async () => {
    await page.keyboard.press('Escape');
    await shop.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId('pause-journal').count(), 0);
  });
});
