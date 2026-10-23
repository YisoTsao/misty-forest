// 端對端：第二章 Phase 3 — 星光照明（規格 10.2）與隱藏的寶箱。
// 沒有照明時打不開藏在花園石頭後面的寶箱；按 G 照明（扣星光值）後可以打開；照明結束後星光值與狀態正確。
// 支線 CH2-SQ-05 被遺忘的花園：菇菇婆婆提出 → 照明打開迷霧入口北邊的舊木盒拿種子 → 回報拿螢苔花種。
// 用法：pnpm build && node e2e/lumen.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, runE2e } from './lib.mjs';

const cache = placements.find((p) => p.id === 'hidden_cache_01');
const seedCache = placements.find((p) => p.id === 'seed_cache_01');

await runE2e('lumen e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, objectState, itemCount }) => {
  const approach = async (p) => {
    for (const [dx, dz] of [[1.2, 0.6], [-1.2, 0.6], [0, 1.2], [0, -1.2], [1.2, 0], [-1.2, 0]]) {
      await teleport(p.position[0] + dx, p.position[2] + dz, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await page.waitForTimeout(250);
      if ((await debug(() => window.__mistwoodDebug.interactTarget())) === p.id) return;
    }
    throw new Error(`靠近 ${p.id} 的所有方向都互動不到`);
  };

  await check('沒有照明時，隱藏的寶箱打不開', async () => {
    await approach(cache);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    assert.notEqual((await objectState(cache.id))?.open, true);
  });

  await check('按 G 照明：扣 15 點星光值，照明中', async () => {
    const mp0 = await debug(() => window.__mistwoodDebug.combatState().mp ?? null);
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().lumen === true, null, { timeout: 2000 });
    const mp1 = await debug(() => window.__mistwoodDebug.combatState().mp ?? null);
    if (mp0 !== null && mp1 !== null) assert.ok(mp0 - mp1 >= 14, `星光值 ${mp0} → ${mp1}`);
  });

  await check('照明中打開隱藏的寶箱：拿到戰利品', async () => {
    await approach(cache);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    assert.equal((await objectState(cache.id))?.open, true);
    assert.ok((await itemCount('starlight_shard')) >= 1);
  });

  await check('被遺忘的花園：接下支線；照明打開舊木盒拿到種子，回報菇菇婆婆拿到螢苔花種', async () => {
    const granny = JSON.parse(await (await import('node:fs')).promises.readFile('src/data/npcs.json', 'utf8')).find((n) => n.id === 'granny');
    const box = page.locator('[data-testid="dialogue"]');
    const talk = async (expected, option) => {
      await teleport(granny.position[0] + 1.6, granny.position[1] + 1.2, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), granny.position);
      await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:granny', null, { timeout: 3000 });
      await page.keyboard.press('KeyE');
      await box.waitFor({ timeout: 2000 });
      assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, expected);
      const o = page.locator('[data-testid="dialogue-option"]', { hasText: option });
      for (let i = 0; i < 10 && (await o.count()) === 0; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
      }
      await o.click();
      for (let i = 0; i < 8 && (await box.count()) > 0; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
      }
      if ((await box.count()) > 0) await page.keyboard.press('Escape');
    };
    for (const q of ['quest_forest_001', 'quest_forest_002', 'quest_forest_003', 'quest_forest_004', 'quest_forest_005', 'quest_forest_006', 'quest_forest_007', 'quest_forest_008', 'quest_forest_sq01']) await debug((id) => window.__mistwoodDebug.setQuestCompleted(id), q);
    await talk('granny_seed_offer', '好，我去看看');
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_forest_sq05')), 'active');
    await debug(() => window.__mistwoodDebug.send({ type: 'DebugSetMp', mp: 100 }));
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().lumen !== true, null, { timeout: 15000 });
    await approach(seedCache);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    assert.notEqual((await objectState(seedCache.id))?.open, true, '沒有照明就打開了');
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().lumen === true, null, { timeout: 2000 });
    await approach(seedCache);
    await page.keyboard.press('KeyE');
    await page.waitForFunction((id) => window.__mistwoodDebug.objectState(id)?.open === true, seedCache.id, { timeout: 3000 });
    assert.equal(await itemCount('forgotten_seed'), 1);
    await talk('granny_seed_turnin', '交給她');
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_forest_sq05')), 'completed');
    assert.equal(await itemCount('glow_seed'), 3);
  });
});
