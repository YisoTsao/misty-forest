// 端對端：第二章 NPC-03 旅行商人托托（規格 8.1）——聚落的信任（quest_forest_004）完成後出現在蘑菇居民聚落，開商店（高價收星晶）。
// 托托出現後存一張截圖 docs/screenshots/phase13/glowmoss_toto.png（外觀檢查用）。
// 用法：pnpm build && node e2e/toto.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const toto = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'toto');
const shopDef = JSON.parse(readFileSync('src/data/shops.json', 'utf8')).find((s) => s.id === 'shop_toto_wares');
const price = (list, id) => shopDef[list].find((e) => e.itemId === id).price;

await runE2e('toto e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const shop = page.getByTestId('shop');
  const row = (id) => page.locator(`[data-testid="shop-row"][data-item="${id}"]`);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const standByToto = async () => {
    await teleport(toto.position[0] + 1.4, toto.position[1] - 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), toto.position);
    await page.waitForTimeout(300);
  };

  await check('聚落還不信任旅人（quest_forest_004 未完成）時，托托不在', async () => {
    await standByToto();
    assert.notEqual(await debug(() => window.__mistwoodDebug.interactTarget()), 'npc:toto');
  });

  await check('取得信任後托托出現；對話打開他的貨攤', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_004'));
    await standByToto();
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:toto', null, { timeout: 5000 });
    await debug(() => {
      window.__mistwoodDebug.setClock(12);
      window.__mistwoodDebug.setBookmark('glowmoss_toto');
    });
    await page.waitForTimeout(800);
    mkdirSync('docs/screenshots/phase13', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/phase13/glowmoss_toto.png' });
    await debug(() => window.__mistwoodDebug.setCameraMode('follow'));
    await standByToto();
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:toto', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, 'toto_intro');
    const option = page.locator('[data-testid="dialogue-option"]', { hasText: '看看你的貨' });
    for (let i = 0; i < 8 && (await option.count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    await option.click();
    await shop.waitFor({ timeout: 2000 });
  });

  await check('把星晶碎片賣給托托，再買一瓶草藥水', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'starlight_shard', count: 2 }] });
    await page.waitForTimeout(200);
    await page.getByTestId('shop-tab-sell').click();
    const before = await itemCount('seed_coin');
    await row('starlight_shard').getByTestId('shop-trade').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('starlight_shard'), 1);
    assert.equal(await itemCount('seed_coin'), before + price('buys', 'starlight_shard'));
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'seed_coin', count: 20 }] });
    await page.waitForTimeout(200);
    await page.getByTestId('shop-tab-buy').click();
    const coins = await itemCount('seed_coin');
    const potions = await itemCount('herb_potion');
    await row('herb_potion').getByTestId('shop-trade').click();
    await page.waitForTimeout(200);
    assert.equal(await itemCount('herb_potion'), potions + 1);
    assert.equal(await itemCount('seed_coin'), coins - price('stock', 'herb_potion'));
    await page.keyboard.press('Escape');
    await shop.waitFor({ state: 'detached', timeout: 2000 });
  });
});
