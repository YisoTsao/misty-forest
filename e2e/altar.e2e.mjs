// 端對端：第二章 Phase 4 — 古樹祭壇與根噬者（規格 B-01、G 區、CH2-MQ-07）。
// 接下 quest_forest_007 後走進祭壇的戰場，把根噬者打到只剩 1 點 → 進入淨化（不會死）；
// 依序點亮三座古樹共鳴石柱 → 根噬者被淨化、打倒只結算一次；回報菇菇婆婆後任務完成。
// 章節結尾（CH2-MQ-08）：回報時拿到古樹核心、接下 quest_forest_008；觀看古樹核心的記憶、走到澄鏡湖的入口 → 完成；無名旅人出現在出口。
// 支線 CH2-SQ-06 守護者的夢：菇菇婆婆提出 → 和淨化後的守護者說話 → 回報拿古樹守護符（截圖 docs/screenshots/phase13/glowmoss_guardian.png）。
// 第二階段（血量跌破門檻）召喚幻霧螢靈；離開戰場時頭目、召喚物與點亮的石柱都重置（規格 §6.4 重試）。
// 用法：pnpm build && node e2e/altar.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const at = (id) => placements.find((p) => p.id === id);
const PILLARS = ['altar_resonance_01', 'altar_resonance_02', 'altar_resonance_03'];
const BOSS = 'boss_root_devourer';

await runE2e('altar e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, objectState, itemCount }) => {
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const bossOf = () => debug((k) => window.__mistwoodDebug.enemies().find((e) => e.kind === k) ?? null, BOSS);
  const questState = (q) => debug((id) => window.__mistwoodDebug.questState(id), q);

  await check('接下 quest_forest_007：前面的主線都完成後可以接取', async () => {
    for (const q of ['quest_forest_001', 'quest_forest_002', 'quest_forest_003', 'quest_forest_004', 'quest_forest_005', 'quest_forest_006']) {
      await debug((id) => window.__mistwoodDebug.setQuestCompleted(id), q);
    }
    await send({ type: 'AcceptQuest', quest: 'quest_forest_007' });
    assert.equal(await questState('quest_forest_007'), 'active');
  });

  await check('走進祭壇的戰場：根噬者出現', async () => {
    await teleport(2112, 11, 900);
    await page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k), BOSS, { timeout: 20000 });
    assert.ok(await bossOf(), '根噬者沒有出現');
  });

  const wisps = () => debug(() => window.__mistwoodDebug.enemies().filter((e) => e.kind === 'mob_fog_wisp' && e.x > 2090 && e.x < 2130 && Math.abs(e.z) < 20).length);
  await check('第二階段：血量跌破門檻時召喚幻霧螢靈', async () => {
    for (let i = 0; i < 40 && (await wisps()) === 0; i++) {
      const b = await bossOf();
      await debug((id) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), b.id);
      await page.waitForTimeout(150);
    }
    assert.equal(await wisps(), 2);
  });

  await check('重試：點亮一座石柱後離開戰場，頭目、召喚的螢靈與石柱都重置', async () => {
    const p = at(PILLARS[0]);
    await teleport(p.position[0] + 1.2, p.position[2] + 0.6, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
    await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, PILLARS[0], { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction((x) => window.__mistwoodDebug.objectState(x)?.active === true, PILLARS[0], { timeout: 3000 });
    await teleport(2106, 18, 800);
    await page.waitForFunction((k) => !window.__mistwoodDebug.enemies().some((e) => e.kind === k), BOSS, { timeout: 5000 });
    await page.waitForTimeout(1500);
    assert.equal(await wisps(), 0, '召喚的螢靈還在');
    assert.notEqual(await debug((x) => window.__mistwoodDebug.objectState(x)?.active, PILLARS[0]), true, '石柱沒有熄滅');
    await teleport(2112, 11, 900);
    await page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k), BOSS, { timeout: 20000 });
    const b = await bossOf();
    assert.equal(b.hp, 320);
  });

  await check('把根噬者打到只剩 1 點：進入淨化，不會被打倒', async () => {
    for (let i = 0; i < 60; i++) {
      const b = await bossOf();
      if (!b || b.hp <= 1) break;
      await debug((id) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), b.id);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
    const b = await bossOf();
    assert.ok(b, '根噬者被打倒了（應該進入淨化）');
    assert.equal(b.hp, 1);
    assert.equal(await debug(() => window.__mistwoodDebug.defeatedBosses().includes('boss_root_devourer')), false);
  });

  await check('依序點亮三座古樹共鳴石柱：最後一座打倒根噬者，只結算一次', async () => {
    for (const id of PILLARS) {
      const p = at(id);
      await teleport(p.position[0] + 1.2, p.position[2] + 0.6, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, id, { timeout: 3000 });
      await page.keyboard.press('KeyE');
      await page.waitForFunction((x) => window.__mistwoodDebug.objectState(x)?.active === true, id, { timeout: 3000 });
    }
    await page.waitForFunction(() => window.__mistwoodDebug.defeatedBosses().includes('boss_root_devourer'), null, { timeout: 3000 });
    assert.equal(await bossOf(), null, '根噬者還在');
    assert.equal(await questState('quest_forest_007'), 'active', '任務要回報菇菇婆婆才完成');
  });

  await check('回報菇菇婆婆：任務 007 完成', async () => {
    const granny = JSON.parse(await (await import('node:fs')).promises.readFile('src/data/npcs.json', 'utf8')).find((n) => n.id === 'granny');
    await teleport(granny.position[0] + 1.6, granny.position[1] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [granny.position[0], granny.position[1]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:granny', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="dialogue"]').waitFor({ timeout: 2000 });
    assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, 'granny_root_turnin');
    for (let i = 0; i < 10 && (await page.locator('[data-testid="dialogue-option"]').count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    await page.locator('[data-testid="dialogue-option"]', { hasText: '交給她' }).click();
    await page.waitForTimeout(300);
    assert.equal(await questState('quest_forest_007'), 'completed');
    assert.equal(await itemCount('ancient_core'), 1);
    assert.equal(await questState('quest_forest_008'), 'active');
  });

  await check('章節結尾：觀看古樹核心的記憶、走到澄鏡湖的入口，quest_forest_008 完成', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    const m = at('ancient_memory_01');
    await teleport(m.position[0] - 1.6, m.position[2] + 0.4, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [m.position[0], m.position[2]]);
    await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, m.id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 3000 });
    assert.match(await dialog.innerText(), /湖/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal((await objectState(m.id))?.active, true);
    await teleport(2131, 49, 1200);
    await page.waitForFunction(() => window.__mistwoodDebug.questState('quest_forest_008') === 'completed', null, { timeout: 5000 });
  });

  await check('無名旅人在出口旁，留下第三章的線索', async () => {
    const wanderer = JSON.parse(await (await import('node:fs')).promises.readFile('src/data/npcs.json', 'utf8')).find((n) => n.id === 'wanderer');
    await teleport(wanderer.position[0] + 1.4, wanderer.position[1] - 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), wanderer.position);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:wanderer', null, { timeout: 5000 });
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="dialogue"]').waitFor({ timeout: 2000 });
    assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, 'wanderer_words');
  });

  await check('守護者的夢：菇菇婆婆提出；和淨化後的守護者說完話，回報拿到古樹守護符', async () => {
    const npcs = JSON.parse(await (await import('node:fs')).promises.readFile('src/data/npcs.json', 'utf8'));
    const box = page.locator('[data-testid="dialogue"]');
    const talk = async (id, expected) => {
      for (let i = 0; i < 8 && (await box.count()) > 0; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(200);
      }
      if ((await box.count()) > 0) await page.keyboard.press('Escape');
      await box.waitFor({ state: 'detached', timeout: 2000 });
      const n = npcs.find((x) => x.id === id);
      await teleport(n.position[0] + Math.sin(n.facingYaw) * 1.8, n.position[1] + Math.cos(n.facingYaw) * 1.8, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), n.position);
      await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === `npc:${x}`, id, { timeout: 5000 }).catch(async (err) => {
        throw new Error(`${id} 不是互動目標（目前 ${await debug(() => window.__mistwoodDebug.interactTarget())}）：${err.message}`);
      });
      await page.keyboard.press('KeyE');
      await box.waitFor({ timeout: 2000 });
      assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, expected);
    };
    const choose = async (text) => {
      const option = page.locator('[data-testid="dialogue-option"]', { hasText: text });
      for (let i = 0; i < 10 && (await option.count()) === 0; i++) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(300);
      }
      await option.click();
      await page.waitForTimeout(200);
    };
    // 支線「會發光的晚餐」排在前面，這裡先當作已完成
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_sq01'));
    await talk('granny', 'granny_dream_offer');
    await choose('好');
    assert.equal(await questState('quest_forest_sq06'), 'active');
    await talk('root_guardian', 'guardian_dream');
    await choose('靜靜聽它說完');
    await debug(() => {
      window.__mistwoodDebug.setClock(12);
      window.__mistwoodDebug.setBookmark('glowmoss_guardian');
    });
    await page.waitForTimeout(900);
    mkdirSync('docs/screenshots/phase13', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/phase13/glowmoss_guardian.png' });
    await debug(() => window.__mistwoodDebug.setCameraMode('follow'));
    await talk('granny', 'granny_dream_turnin');
    await choose('說說守護者的夢');
    assert.equal(await questState('quest_forest_sq06'), 'completed');
    assert.equal(await itemCount('guardian_charm'), 1);
  });
});
