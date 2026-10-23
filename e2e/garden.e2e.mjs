// 端對端：任務 7K — quest_dawn_005「花園第一顆種子」（Bible §21.2、§22.1）。
// 木橋修好後向桃樂接取（拿到種子）→ 在西坊農田按 E 挖鬆土 → 到家園小島按 B、選花圃、按 E 放下（種下種子）→
// 回報桃樂 → 睡一覺（時間往前）後花圃開花。
// 用法：pnpm build && node e2e/garden.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const Q = 'quest_dawn_005';
const ISLAND = { x: 37.5, z: 8 };

await runE2e('garden e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const buildings = () => debug(() => window.__mistwoodDebug.buildings());
  const approach = async (x, z, ax, az, expected, distance) => {
    const len = Math.hypot(ax, az) || 1;
    await teleport(x + (ax / len) * distance, z + (az / len) * distance, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  const talkToTao = async () => {
    const n = npcs.find((x) => x.id === 'tao');
    await approach(n.position[0], n.position[1], Math.sin(n.facingYaw), Math.cos(n.facingYaw), 'npc:tao', 1.8);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const closeDialogue = async () => {
    for (let i = 0; i < 8 && (await box.count()) > 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    if ((await box.count()) > 0) await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  };

  await debug(() => {
    window.__mistwoodDebug.setQuestCompleted('wood_for_bridge');
    window.__mistwoodDebug.setQuestCompleted('repair_bridge');
  });

  await check('向桃樂接下「花園第一顆種子」，拿到兩顆種子', async () => {
    await talkToTao();
    assert.equal((await dialogue()).dialogueId, 'tao_garden_offer');
    for (let i = 0; i < 4 && (await dialogue()).nodeId !== 'ask'; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    await page.locator('[data-testid="dialogue-option"]', { hasText: '我來種' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
    assert.equal(await itemCount('wildflower_seed'), 2);
  });

  await check('在西坊農田按 E 挖鬆土', async () => {
    for (const id of ['farm_soil_mound_01', 'farm_soil_mound_02', 'farm_soil_mound_03']) {
      const p = placements.find((x) => x.id === id);
      await approach(p.position[0], p.position[2], 1, 0.3, id, 1.1);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(1300);
      assert.equal((await objectState(id))?.harvested, true, id);
    }
    assert.ok((await itemCount('loose_soil')) >= 3);
  });

  await check('家園小島：B → 花圃 → E 放下，種子種下去、任務可以回報', async () => {
    await debug(() => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 4 }] }));
    await teleport(ISLAND.x - 2, ISLAND.z, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [ISLAND.x + 2, ISLAND.z]);
    await page.keyboard.press('KeyB');
    await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 2000 });
    await page.locator('[data-testid="build-option-garden_plot"]').click();
    await page.locator('[data-testid="build-status"]').waitFor({ timeout: 2000 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-testid="build-problem"]').innerText(), '可以放置');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    const list = await buildings();
    assert.equal(list.filter((b) => b.buildable === 'garden_plot').length, 1);
    assert.equal(await itemCount('wildflower_seed'), 1);
    await page.keyboard.press('KeyB');
    await page.waitForTimeout(300);
  });

  await check('回報桃樂；時間過去後花圃開花', async () => {
    await talkToTao();
    assert.equal((await dialogue()).dialogueId, 'tao_garden_turnin');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '種下去了' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    const plot = (await buildings()).find((b) => b.buildable === 'garden_plot');
    assert.equal(await debug((id) => window.__mistwoodDebug.buildingStage(id), plot.id), 0);
    // 先到中午再到 20 點：直接跳到 20 點時，目前若已接近 20 點，經過的時間可能不夠長（共享時鐘）
    await debug(() => window.__mistwoodDebug.setClock(12));
    await debug(() => window.__mistwoodDebug.setClock(20));
    await page.waitForTimeout(300);
    assert.equal(await debug((id) => window.__mistwoodDebug.buildingStage(id), plot.id), 2);
  });
});
