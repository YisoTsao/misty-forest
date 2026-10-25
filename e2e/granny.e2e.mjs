// 端對端：第二章 Phase 2 — 聚落的主線（規格 8.2 CH2-MQ-02 至 04）與菇菇婆婆的對話。
// 螢苔的呼吸（凝膠 ×2 → 純淨螢苔 ×2）→ 倒流的溪水（婆婆指路、菇伯委託與回報，水輪轉到石碑的答案）→ 不願相信旅人的居民（和菇伯、菇丁、菇哨談過 → 螢光提燈）。
// 支線 CH2-SQ-01 會發光的晚餐：主線沒有新委託時提出；實際在溪谷淺灘撈一條溪魚，其餘材料用指令給，回報拿燉湯、工作台多出燉湯配方。
// 每一步都實際和菇菇婆婆對話；水輪的轉動用權威指令代替（實際按 E 的流程由 creek 驗證）。外觀以截圖檢查。
// 用法：pnpm build && node e2e/granny.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const granny = npcs.find((n) => n.id === 'granny');

await runE2e('granny e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const questState = (q) => debug((id) => window.__mistwoodDebug.questState(id), q);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const talkTo = async (id) => {
    const npc = npcs.find((n) => n.id === id);
    await teleport(npc.position[0] + 1.6, npc.position[1] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [npc.position[0], npc.position[1]]);
    await page.waitForFunction((target) => window.__mistwoodDebug.interactTarget() === target, `npc:${id}`, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const talkToGranny = () => talkTo(granny.id);
  /** 選項在文字打完後才出現：沒有選項就按空白前進，直到出現為止 */
  const choose = async (text) => {
    const option = page.locator('[data-testid="dialogue-option"]', { hasText: text });
    for (let i = 0; i < 10 && (await option.count()) === 0; i++) {
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

  await check('第一章的任務完成前，螢苔的呼吸不能接；菇菇婆婆只說開場白', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_001'));
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_gel_offer');
    await choose('好，我去看看');
    await closeDialogue();
    assert.equal(await questState('quest_forest_002'), 'active');
  });

  await check('交出凝膠 ×2：菇菇婆婆回報，拿到純淨螢苔 ×2', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'moss_gel', count: 2 }] });
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_gel_turnin');
    await choose('交給她');
    await closeDialogue();
    assert.equal(await questState('quest_forest_002'), 'completed');
    assert.equal(await itemCount('moss_gel'), 0);
    assert.equal(await itemCount('pure_glowmoss'), 2);
  });

  await check('倒流的溪水：婆婆指路、菇伯委託；轉到石碑的答案，回菇伯那裡回報', async () => {
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_wheels_point');
    await closeDialogue();
    assert.equal(await questState('quest_forest_003'), 'available');
    await talkTo('mush_farmer');
    assert.equal((await dialogue()).dialogueId, 'mush_farmer_wheels_offer');
    await choose('交給我');
    await closeDialogue();
    assert.equal(await questState('quest_forest_003'), 'active');
    // 水閘先打開（苔石推兩格，2026-10-25）
    for (let i = 0; i < 2; i++) await send({ type: 'PushObject', placementId: 'creek_push_stone' });
    // 水閘打開的訊息
    const message = page.locator('[data-testid="message-dialog"]');
    await message.waitFor({ timeout: 2000 });
    await page.keyboard.press('KeyE');
    await message.waitFor({ state: 'detached', timeout: 2000 });
    const wheel = (id) => send({ type: 'TurnObject', placementId: id });
    for (const [id, times] of [['creek_wheel_01', 1], ['creek_wheel_02', 3], ['creek_wheel_03', 2]]) for (let i = 0; i < times; i++) await wheel(id);
    await page.waitForTimeout(300);
    await talkTo('mush_farmer');
    assert.equal((await dialogue()).dialogueId, 'mush_farmer_wheels_turnin');
    await choose('水輪都轉好了');
    await closeDialogue();
    assert.equal(await questState('quest_forest_003'), 'completed');
  });

  await check('不願相信旅人的居民：和菇伯、菇丁（送孢子）、菇哨談過，拿到螢光提燈', async () => {
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_help_offer');
    await choose('好，我去看看');
    await closeDialogue();
    await talkTo('mush_farmer');
    assert.equal((await dialogue()).dialogueId, 'mush_farmer_quest');
    await choose('我只是想幫上忙');
    await closeDialogue();
    // 沒有孢子時菇丁只說想要什麼
    await talkTo('mush_kid');
    assert.equal((await dialogue()).dialogueId, 'mush_kid_quest_need');
    await closeDialogue();
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'glow_spore', count: 1 }] });
    await talkTo('mush_kid');
    await choose('送你一顆微光孢子');
    await closeDialogue();
    assert.equal(await itemCount('glow_spore'), 0);
    // 答錯可以重來
    await talkTo('mush_lookout');
    await choose('拔腿就跑');
    await closeDialogue();
    assert.equal(await questState('quest_forest_004'), 'active');
    await talkTo('mush_lookout');
    await choose('點亮燈');
    await closeDialogue();
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_help_turnin');
    await choose('交給她');
    await closeDialogue();
    assert.equal(await questState('quest_forest_004'), 'completed');
    assert.equal(await itemCount('glow_lantern'), 1);
  });

  await check('會發光的晚餐：主線有新委託時先說主線；之後提出支線，撈溪魚、交材料，拿到燉湯與配方', async () => {
    // 004 完成後主線 005 可接：婆婆先指路到南口的莉露；莉露從花園移到南口
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_guard_point');
    await closeDialogue();
    await talkTo('lilu_gate');
    assert.equal((await dialogue()).dialogueId, 'lilu_guard_offer');
    await choose('我們一起去');
    await closeDialogue();
    assert.equal(await questState('quest_forest_005'), 'active');
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_005'));
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_006'));
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_007'));
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_008'));
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_dinner_offer');
    await choose('好，我去看看');
    await closeDialogue();
    assert.equal(await questState('quest_forest_sq01'), 'active');
    const spot = (await import('./lib.mjs')).placements.find((p) => p.id === 'creek_fish_spot_01');
    await teleport(spot.position[0] + 1.2, spot.position[2], 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [spot.position[0], spot.position[2]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'creek_fish_spot_01', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.objectState('creek_fish_spot_01')?.harvested === true, null, { timeout: 5000 });
    assert.equal(await itemCount('creek_fish'), 1);
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'creek_fish', count: 1 }, { itemId: 'glow_moss', count: 3 }, { itemId: 'fungus_cap', count: 2 }] });
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_dinner_turnin');
    await choose('交給她');
    await closeDialogue();
    assert.equal(await questState('quest_forest_sq01'), 'completed');
    assert.equal(await itemCount('glow_stew'), 2);
    await debug(() => window.__mistwoodDebug.openCraft('glow_workbench'));
    await page.locator('[data-testid="craft-row"][data-recipe="recipe_glow_stew"]').waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
  });
});
