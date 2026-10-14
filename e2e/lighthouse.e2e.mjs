// 端對端：任務 7D — quest_dawn_003「燈塔的最後一盞光」（Bible §5.4）。
// 向米菈接取 → 按 E 撿三片燈罩碎片 → 噗啾沒趕走前淨化不了迷霧核心 → 打倒三隻迷霧噗啾 → 按 E 淨化核心 →
// 在燈塔下按 E 裝回燈罩點亮燈塔（光柱出現）→ 回報米菈 → 林道入口可以通往螢苔祕林。
// 外觀以截圖檢查（node scripts/screenshot.mjs phase7 highland --lighthouse）。
// 用法：pnpm build && node e2e/lighthouse.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const P = (id) => {
  const p = placements.find((x) => x.id === id);
  if (!p) throw new Error(`找不到 placement ${id}`);
  return p;
};
const LAMP = 'highland_lighthouse_lamp';
const CORE = 'highland_mist_core';
const SHARDS = ['highland_lantern_shard_01', 'highland_lantern_shard_02', 'highland_lantern_shard_03'];

await runE2e('lighthouse e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const questState = (id) => debug((q) => window.__mistwoodDebug.questState(q), id);
  const toasts = () => debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
  const dialogueNode = () => debug(() => window.__mistwoodDebug.dialogue());

  const approach = async (x, z, awayX, awayZ, expected, distance) => {
    const len = Math.hypot(awayX, awayZ) || 1;
    await teleport(x + (awayX / len) * distance, z + (awayZ / len) * distance, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  const pressE = async () => {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
  };
  const talkToElder = async () => {
    const n = npcs.find((x) => x.id === 'elder');
    const [x, z] = n.position;
    await approach(x, z, Math.sin(n.facingYaw), Math.cos(n.facingYaw), 'npc:elder', 1.8);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const advanceTo = async (nodeId) => {
    for (let i = 0; i < 8; i++) {
      if ((await dialogueNode())?.nodeId === nodeId) return;
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    throw new Error(`對話沒有到達節點 ${nodeId}（目前 ${(await dialogueNode())?.nodeId}）`);
  };
  const choose = async (text) => {
    await page.locator('[data-testid="dialogue-option"]', { hasText: text }).click();
    await page.waitForTimeout(150);
  };
  const closeDialogue = async () => {
    for (let i = 0; i < 6 && (await box.count()) > 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    // 最後一個節點有選項（例如米菈的「看看補給品」）時 Space 不會關閉，改按 Esc
    if ((await box.count()) > 0) await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  };

  await debug(() => {
    const d = window.__mistwoodDebug;
    for (const q of ['wood_for_bridge', 'repair_bridge', 'clear_forest']) d.setQuestCompleted(q);
    d.setMistStage('forest', 'clear');
  });

  await check('林道入口：燈塔還沒亮，說明原因、不能通過', async () => {
    const gate = P('dawn_gate_glowmoss');
    const yaw = gate.rotation[1];
    await approach(gate.position[0], gate.position[2], Math.sin(yaw), Math.cos(yaw), 'dawn_gate_glowmoss', 2);
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /燈塔/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal((await debug(() => window.__mistwoodDebug.currentMap())).at, 'dawnvale');
  });

  await check('米菈交付「燈塔的最後一盞光」', async () => {
    await talkToElder();
    assert.equal((await dialogueNode()).dialogueId, 'elder_lighthouse_offer');
    await advanceTo('ask');
    await choose('我去把燈塔點亮');
    assert.equal(await questState('quest_dawn_003'), 'active');
    await closeDialogue();
  });

  await check('按 E 撿起三片燈罩碎片', async () => {
    for (const id of SHARDS) {
      const p = P(id);
      await approach(p.position[0], p.position[2], 1, 0.3, id, 1.1);
      await pressE();
      assert.equal((await objectState(id))?.harvested, true, id);
    }
    assert.equal(await itemCount('lantern_shard'), 3);
  });

  await check('噗啾沒趕走前淨化不了迷霧核心；打倒三隻後按 E 淨化', async () => {
    const core = P(CORE);
    await approach(core.position[0], core.position[2], -1, 0, CORE, 2);
    await pressE();
    assert.equal((await objectState(CORE))?.active, undefined);
    assert.ok((await toasts()).includes('toast.notYet'));
    // 燈塔旁的噗啾：以除錯指令生成後打倒
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().filter((e) => e.kind === 'mist_wisp').length > 0, null, { timeout: 8000 });
    for (let n = 0; n < 3; n++) {
      const progress = await debug(() => window.__mistwoodDebug.questObjectives('quest_dawn_003')[0].current);
      if (progress >= 3) break;
      await page.waitForFunction(() => window.__mistwoodDebug.enemies().some((e) => e.kind === 'mist_wisp'), null, { timeout: 10_000 });
      const wisp = (await debug(() => window.__mistwoodDebug.enemies())).find((e) => e.kind === 'mist_wisp');
      for (let i = 0; i < 10 && (await debug((id) => window.__mistwoodDebug.enemies().some((e) => e.id === id), wisp.id)); i++) {
        await debug((id) => window.__mistwoodDebug.send({ type: 'AttackEnemy', enemyId: id, attack: 'spell_starlight_burst' }), wisp.id);
        await debug(() => window.__mistwoodDebug.setMp(100));
      }
    }
    assert.equal((await debug(() => window.__mistwoodDebug.questObjectives('quest_dawn_003')))[0].current, 3);
    await approach(core.position[0], core.position[2], -1, 0, CORE, 2);
    await pressE();
    assert.equal((await objectState(CORE))?.active, true);
  });

  await check('在燈塔下按 E 裝回燈罩：燈塔點亮、碎片交出、光柱出現', async () => {
    const lamp = P(LAMP);
    await approach(lamp.position[0], lamp.position[2], 0.3, 1, LAMP, 3.6);
    await pressE();
    assert.equal((await objectState(LAMP))?.repaired, true);
    assert.equal(await itemCount('lantern_shard'), 0);
    assert.ok((await toasts()).includes('toast.lighthouseLit'));
    assert.equal(await debug(() => window.__mistwoodDebug.lighthouseBeam()), true);
  });

  await check('回報米菈：晨之共鳴與晨光護符、高地的霧散去', async () => {
    await talkToElder();
    assert.equal((await dialogueNode()).dialogueId, 'elder_lighthouse_turnin');
    await choose('燈塔點亮了');
    assert.equal(await questState('quest_dawn_003'), 'completed');
    await closeDialogue();
    assert.equal(await itemCount('dawn_resonance'), 1);
    assert.equal(await itemCount('dawn_charm'), 1);
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).highland, 'clear');
  });

  await check('林道入口打開：走過去抵達螢苔祕林', async () => {
    const gate = P('dawn_gate_glowmoss');
    const yaw = gate.rotation[1];
    await approach(gate.position[0], gate.position[2], Math.sin(yaw), Math.cos(yaw), 'dawn_gate_glowmoss', 2);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'glowmoss', null, { timeout: 4000 });
  });
});
