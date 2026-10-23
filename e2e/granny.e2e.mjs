// 端對端：第二章 Phase 2 — 聚落的主線（規格 8.2 CH2-MQ-02 至 04）與菇菇婆婆的對話。
// 螢苔的呼吸（凝膠 ×2 → 純淨螢苔 ×2）→ 倒流的溪水（水輪轉到石碑的答案，任務自動達成）→ 不願相信旅人的居民（微光孢子 ×2 → 螢光提燈）。
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
  const talkToGranny = async () => {
    await teleport(granny.position[0] + 1.6, granny.position[1] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [granny.position[0], granny.position[1]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:granny', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
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

  await check('倒流的溪水：轉到石碑的答案，任務在菇菇婆婆那裡變成可以回報', async () => {
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_wheels_hint');
    await closeDialogue();
    assert.equal(await questState('quest_forest_003'), 'available');
    // 接取要等菇菇婆婆的提示之後，任務 003 沒有發起對話選項，直接以指令接取
    await send({ type: 'AcceptQuest', quest: 'quest_forest_003' });
    assert.equal(await questState('quest_forest_003'), 'active');
    const wheel = (id) => send({ type: 'TurnObject', placementId: id });
    for (const [id, times] of [['creek_wheel_01', 1], ['creek_wheel_02', 3], ['creek_wheel_03', 2]]) for (let i = 0; i < times; i++) await wheel(id);
    await page.waitForTimeout(300);
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_wheels_turnin');
    await choose('交給她');
    await closeDialogue();
    assert.equal(await questState('quest_forest_003'), 'completed');
  });

  await check('不願相信旅人的居民：交出微光孢子 ×2，拿到螢光提燈', async () => {
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_help_offer');
    await choose('好，我去看看');
    await closeDialogue();
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'glow_spore', count: 2 }] });
    await talkToGranny();
    assert.equal((await dialogue()).dialogueId, 'granny_help_turnin');
    await choose('交給她');
    await closeDialogue();
    assert.equal(await questState('quest_forest_004'), 'completed');
    assert.equal(await itemCount('glow_lantern'), 1);
  });
});
