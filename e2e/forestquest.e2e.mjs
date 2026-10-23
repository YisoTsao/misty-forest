// 端對端：任務 12E — quest_forest_001「失去光芒的森林」（Bible §6.5、規格 8.2 CH2-MQ-01）與第二章 Phase 1 的完整流程。
// 第一章的燈塔完成後，莉露在迷霧入口：按 E 與選項接取 → 採集純淨螢苔 → 點亮星光燈柱 → 回報拿到星光羅盤 →
// 支線 CH2-SQ-02 螢火蟲回家：莉露提出 → 找回三隻失散的螢靈 → 回報；之後莉露改說後續的話。存檔重開後任務與羅盤都還在。外觀以截圖檢查（glowmoss_* 書籤、--npc）。
// 用法：pnpm build && node e2e/forestquest.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const Q = 'quest_forest_001';
const LAMP = 'glowmoss_star_lamp_01';
const NODE = 'glowmoss_pure_node_01';
const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const lamp = placements.find((p) => p.id === LAMP);
const node = placements.find((p) => p.id === NODE);
const lilu = npcs.find((n) => n.id === 'lilu');

await runE2e('forestquest e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const questState = () => debug((q) => window.__mistwoodDebug.questState(q), Q);
  const approach = async (x, z, expected) => {
    await teleport(x, z, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  const talkTo = async () => {
    await approach(lilu.position[0] + Math.sin(lilu.facingYaw) * 1.6, lilu.position[1] + Math.cos(lilu.facingYaw) * 1.6, 'npc:lilu');
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const advanceTo = async (nodeId) => {
    for (let i = 0; i < 8; i++) {
      if ((await dialogue())?.nodeId === nodeId) return;
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    throw new Error(`對話沒有到達節點 ${nodeId}（目前 ${(await dialogue())?.nodeId}）`);
  };
  const choose = async (text) => {
    await page.locator('[data-testid="dialogue-option"]', { hasText: text }).click();
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

  await check('第一章完成前莉露只說開場白，任務不能接', async () => {
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_intro');
    await closeDialogue();
    assert.equal(await questState(), 'locked');
  });

  await check('第一章完成後莉露提出委託，選「我去看看」接取任務', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_offer');
    await advanceTo('ask');
    await choose('我去看看');
    await closeDialogue();
    assert.equal(await questState(), 'active');
  });

  await check('採集純淨螢苔：發光的螢苔採集點給一顆純淨螢苔', async () => {
    await approach(node.position[0], node.position[2] + 1.1, NODE);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1500);
    assert.equal(await itemCount('pure_glowmoss'), 1);
  });

  await check('點亮星光燈柱：消耗純淨螢苔，燈柱亮起、任務待回報', async () => {
    await approach(lamp.position[0] + 1.6, lamp.position[2], LAMP);
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="message-dialog"]').waitFor({ timeout: 2000 });
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="message-dialog"]').waitFor({ state: 'detached', timeout: 2000 });
    assert.equal((await objectState(LAMP))?.active, true);
    assert.equal(await itemCount('pure_glowmoss'), 0);
    assert.equal(await questState(), 'active');
  });

  await check('回報莉露：拿到星光羅盤，任務完成，莉露改說後來的話', async () => {
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_turnin');
    await choose('我點亮了燈柱');
    await advanceTo('gift');
    await closeDialogue();
    assert.equal(await questState(), 'completed');
    assert.equal(await itemCount('star_compass'), 1);
  });

  await check('螢火蟲回家：莉露提出支線；三隻螢靈只有任務進行中才叫得回來；回報後莉露改說後續的話', async () => {
    const fly = (id) => placements.find((p) => p.id === id);
    await teleport(fly('lost_firefly_01').position[0] + 1.4, fly('lost_firefly_01').position[2], 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [fly('lost_firefly_01').position[0], fly('lost_firefly_01').position[2]]);
    await page.waitForTimeout(300);
    assert.notEqual(await debug(() => window.__mistwoodDebug.interactTarget()), 'lost_firefly_01', '還沒接任務就能呼喚螢靈');
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_firefly_offer');
    await advanceTo('ask');
    for (let i = 0; i < 8 && (await page.locator('[data-testid="dialogue-option"]').count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
    }
    await choose('我去找找看');
    await closeDialogue();
    for (const id of ['lost_firefly_01', 'lost_firefly_02', 'lost_firefly_03']) {
      const p = fly(id);
      await teleport(p.position[0] + 1.4, p.position[2], 700);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, id, { timeout: 3000 });
      await page.keyboard.press('KeyE');
      await page.waitForFunction((x) => window.__mistwoodDebug.objectState(x)?.active === true, id, { timeout: 3000 });
    }
    assert.equal(await debug(() => window.__mistwoodDebug.questProgress('quest_forest_sq02')), 3);
    const spores = await itemCount('glow_spore');
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_firefly_turnin');
    await advanceTo('ask');
    for (let i = 0; i < 8 && (await page.locator('[data-testid="dialogue-option"]').count()) === 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(250);
    }
    await choose('牠們都回來了');
    await closeDialogue();
    assert.equal(await debug(() => window.__mistwoodDebug.questState('quest_forest_sq02')), 'completed');
    assert.equal(await itemCount('glow_spore'), spores + 3);
    await talkTo();
    assert.equal((await dialogue()).dialogueId, 'lilu_after');
    await closeDialogue();
  });

  await check('在螢苔祕林存檔，任務與星光羅盤寫進存檔', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    assert.equal(data.quests[Q].status, 'completed');
    assert.ok(data.inventory.slots.some((s) => s?.itemId === 'star_compass' && s.count === 1));
  });
});

await runE2e('forestquest e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, itemCount, objectState }) => {
  await check('讀檔後燈柱仍亮著，任務仍是完成狀態，星光羅盤還在', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(1500);
    assert.equal((await objectState(LAMP))?.active, true);
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('star_compass'), 1);
  });
});
