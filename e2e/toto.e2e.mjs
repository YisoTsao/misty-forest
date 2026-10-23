// 端對端：第二章 NPC-03 旅行商人托托（規格 8.1）——聚落的信任（quest_forest_004）完成後出現在蘑菇居民聚落，開商店（高價收星晶）；
// 支線 CH2-SQ-04「不會說謊的石碑」：之後托托提出，讀石碑、轉星盤（西、下、東）、回報拿古代星圖（截圖 glowmoss_star_dials.png）。
// 支線 CH2-SQ-03「商人的失物」：接取 → 在迷霧深層撿回貨箱、擊退森林狼 ×3 → 回報，貨攤多出守衛木核與星晶碎片。
// 托托出現後存一張截圖 docs/screenshots/phase13/glowmoss_toto.png（外觀檢查用）。
// 用法：pnpm build && node e2e/toto.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
const crate = placements.find((p) => p.id === 'toto_crate_01');
const wolves = JSON.parse(readFileSync('src/data/spawners.json', 'utf8')).find((sp) => sp.id === 'deep_wolves');
const toto = JSON.parse(readFileSync('src/data/npcs.json', 'utf8')).find((n) => n.id === 'toto');
const shopDef = JSON.parse(readFileSync('src/data/shops.json', 'utf8')).find((s) => s.id === 'shop_toto_wares');
const price = (list, id) => shopDef[list].find((e) => e.itemId === id).price;

await runE2e('toto e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const shop = page.getByTestId('shop');
  const row = (id) => page.locator(`[data-testid="shop-row"][data-item="${id}"]`);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const choose = async (text) => {
    const option = page.locator('[data-testid="dialogue-option"]', { hasText: text });
    for (let i = 0; i < 8 && (await option.count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    await option.click();
    await page.waitForTimeout(150);
  };
  const closeDialogue = async () => {
    for (let i = 0; i < 8 && (await box.count()) > 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    if ((await box.count()) > 0) await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  };
  const questState = () => debug(() => window.__mistwoodDebug.questState('quest_forest_sq03'));
  const talkToToto = async () => {
    await standByToto();
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:toto', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    return (await debug(() => window.__mistwoodDebug.dialogue())).dialogueId;
  };
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
    assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, 'toto_crate_offer');
    await choose('看看你的貨');
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

  await check('商人的失物：接取支線；貨箱只有任務進行中才撿得起來', async () => {
    assert.equal(await talkToToto(), 'toto_crate_offer');
    await choose('我幫你找');
    await closeDialogue();
    assert.equal(await questState(), 'active');
    await teleport(crate.position[0] + 1.6, crate.position[2] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [crate.position[0], crate.position[2]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'toto_crate_01', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.questObjectives('quest_forest_sq03')[0].current === 1, null, { timeout: 5000 });
  });

  await check('擊退森林狼 ×3 後回報托托：拿到謝禮，貨攤多出守衛木核與星晶碎片', async () => {
    await teleport(wolves.center[0], wolves.center[1] + wolves.radius + 6, 300);
    for (let n = 0; n < 40; n++) {
      const done = (await debug(() => window.__mistwoodDebug.questObjectives('quest_forest_sq03')))[1].current;
      if (done >= 3) break;
      const wolf = (await debug(() => window.__mistwoodDebug.enemies())).find((e) => e.kind === 'mob_mist_wolf' && e.anim);
      if (!wolf) {
        await page.waitForTimeout(1000);
        continue;
      }
      for (let i = 0; i < 12 && (await debug(() => window.__mistwoodDebug.enemies())).some((e) => e.id === wolf.id); i++) {
        await debug((id) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), wolf.id);
        await page.waitForTimeout(200);
      }
    }
    assert.equal((await debug(() => window.__mistwoodDebug.questObjectives('quest_forest_sq03')))[1].current, 3);
    const coins = await itemCount('seed_coin');
    assert.equal(await talkToToto(), 'toto_crate_turnin');
    await choose('把貨箱還給他');
    await closeDialogue();
    assert.equal(await questState(), 'completed');
    assert.equal(await itemCount('seed_coin'), coins + 40);
    await debug(() => window.__mistwoodDebug.openShop('shop_toto_wares'));
    await shop.waitFor({ timeout: 2000 });
    assert.equal(await row('guardian_heartwood').count(), 1);
    assert.equal(await row('starlight_shard').count(), 1);
    await page.keyboard.press('Escape');
  });

  await check('不會說謊的石碑：托托提出；讀石碑、按 E 轉星盤到西、下、東，回報拿到古代星圖', async () => {
    assert.equal(await talkToToto(), 'toto_star_offer');
    await choose('我幫你找');
    await closeDialogue();
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_forest_sq04')), 'active');
    const P = (id) => placements.find((p) => p.id === id);
    const tablet = P('star_tablet');
    await teleport(tablet.position[0], tablet.position[2] + 1.6, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [tablet.position[0], tablet.position[2]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'star_tablet', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 3000 });
    assert.match(await dialog.innerText(), /北冠/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    for (const [id, times] of [['star_dial_01', 3], ['star_dial_02', 2], ['star_dial_03', 1]]) {
      const p = P(id);
      await teleport(p.position[0] + 0.2, p.position[2] + 1.6, 700);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      // 每一下等提示出現、按 E、等轉動位置加一（轉動有 0.45 秒的動作延遲）
      for (let i = 0; i < times; i++) {
        await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, id, { timeout: 3000 });
        await page.keyboard.press('KeyE');
        await page.waitForFunction(([x, n]) => (window.__mistwoodDebug.objectState(x)?.turn ?? 0) === n, [id, i + 1], { timeout: 3000 });
      }
      assert.equal((await debug((x) => window.__mistwoodDebug.objectState(x), id))?.turn, times);
    }
    await debug(() => {
      window.__mistwoodDebug.setClock(12);
      window.__mistwoodDebug.viewAt([1924, 3.6, -16.5], [1924, 2.2, -24]);
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'docs/screenshots/phase13/glowmoss_star_dials.png' });
    await debug(() => window.__mistwoodDebug.setCameraMode('follow'));
    assert.equal(await talkToToto(), 'toto_star_turnin');
    await choose('星盤都轉好了');
    await closeDialogue();
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_forest_sq04')), 'completed');
    assert.equal(await itemCount('star_chart'), 1);
  });
});
