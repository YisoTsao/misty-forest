// 端對端：任務 7G — quest_dawn_004「郵袋裡的三封信」（Bible §22.1）。
// 木橋修好後尼可出現 → 實際按 E 與對話選項接取（拿到三封信）→ 按 E 撿兩籃乾布 → 先送波木（第一封的回應）、
// 再送米菈、進螢苔祕林送琳娜 → 回報尼可（依第一封換感謝語）→ 明信片與種籽幣；任務日誌分在「角色故事」。
// 用法：pnpm build && node e2e/letters.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const Q = 'quest_dawn_004';
const CLOTH = ['village_dry_cloth_01', 'village_dry_cloth_02'];

await runE2e('letters e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const approach = async (x, z, ax, az, expected, distance) => {
    const len = Math.hypot(ax, az) || 1;
    await teleport(x + (ax / len) * distance, z + (az / len) * distance, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  const talkTo = async (id) => {
    const n = npcs.find((x) => x.id === id);
    await approach(n.position[0], n.position[1], Math.sin(n.facingYaw), Math.cos(n.facingYaw), `npc:${id}`, 1.8);
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
    // 最後一個節點有選項（例如米菈的「看看補給品」）時 Space 不會關閉，改按 Esc
    if ((await box.count()) > 0) await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  };
  const deliver = async (id, expectedDialogue) => {
    await talkTo(id);
    assert.equal((await dialogue()).dialogueId, expectedDialogue);
    await choose('尼可託我送來的');
    await closeDialogue();
  };

  await check('木橋修好前沒有尼可；修好後出現，按 E 接下任務、拿到三封信', async () => {
    const n = npcs.find((x) => x.id === 'niko');
    await teleport(n.position[0] + 1.5, n.position[1] + 1.5, 800);
    assert.notEqual(await debug(() => window.__mistwoodDebug.interactTarget()), 'npc:niko');
    await debug(() => {
      window.__mistwoodDebug.setQuestCompleted('wood_for_bridge');
      window.__mistwoodDebug.setQuestCompleted('repair_bridge');
    });
    await page.waitForTimeout(500);
    await talkTo('niko');
    assert.equal((await dialogue()).dialogueId, 'niko_offer');
    await advanceTo('wet');
    await choose('我來幫你送');
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
    for (const id of ['letter_elder', 'letter_balu', 'letter_linna']) assert.equal(await itemCount(id), 1, id);
  });

  await check('按 E 撿兩籃乾布', async () => {
    for (const id of CLOTH) {
      const p = placements.find((x) => x.id === id);
      await approach(p.position[0], p.position[2], 1, 0.4, id, 1.1);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(1300);
      assert.equal((await objectState(id))?.harvested, true, id);
    }
    assert.equal(await itemCount('dry_cloth'), 2);
  });

  await check('先送波木（第一封的回應），再送米菈；信交出去', async () => {
    await deliver('balu', 'balu_letter_first');
    await deliver('elder', 'elder_letter');
    assert.equal(await itemCount('letter_balu'), 0);
    assert.equal(await itemCount('letter_elder'), 0);
  });

  await check('進螢苔祕林送琳娜；回到村子向尼可回報，感謝語提到先送了波木', async () => {
    await debug(() => window.__mistwoodDebug.travelToMap('glowmoss'));
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().shown === 'glowmoss', null, { timeout: 4000 });
    await page.waitForTimeout(1000);
    await deliver('linna', 'linna_letter');
    await debug(() => window.__mistwoodDebug.travelToMap('dawnvale'));
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().shown === 'dawnvale', null, { timeout: 4000 });
    await page.waitForTimeout(1000);
    await talkTo('niko');
    assert.equal((await dialogue()).dialogueId, 'niko_turnin_balu');
    await choose('都送到了');
    await advanceTo('thanks');
    assert.match(await box.innerText(), /波木/);
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('postcard_blank'), 3);
    assert.equal(await itemCount('seed_coin'), 30);
    assert.equal(await itemCount('dry_cloth'), 0);
  });

  await check('任務日誌：已完成分頁裡分在「角色故事」', async () => {
    await page.keyboard.press('KeyJ');
    await page.getByTestId('quest-journal').waitFor({ timeout: 2000 });
    await page.getByTestId('journal-tab-completed').click();
    await page.locator(`[data-testid="journal-entry"][data-quest="${Q}"]`).click();
    assert.match(await page.getByTestId('journal-detail').innerText(), /角色故事/);
    await page.keyboard.press('Escape');
  });
});
