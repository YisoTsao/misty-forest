// 端對端：任務 9C — 伊芙與 quest_lake_001「湖面不肯忘記」（Bible §7.4、§21.5）。
// 苔冠下的守衛之後向奧林接取 → 到澄鏡湖找伊芙（湖畔營地，水獺造型）→ 調查三處不自然的倒影（顯示倒影裡的景象、倒影淡下來）
// → 回報奧林（三道波浪的「潮」符號）→ 水鏡符號紀錄。
// 用法：pnpm build && node e2e/lakequest.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const Q = 'quest_lake_001';
const P = (id) => placements.find((p) => p.id === id);

await runE2e('lakequest e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const target = (id) => page.waitForFunction((t) => window.__mistwoodDebug.interactTarget() === t, id, { timeout: 3000 });
  const talkTo = async (id) => {
    const n = npcs.find((x) => x.id === id);
    await teleport(n.position[0] + Math.sin(n.facingYaw) * 1.8, n.position[1] + Math.cos(n.facingYaw) * 1.8, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), n.position);
    await target(`npc:${id}`);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const advanceTo = async (nodeId) => {
    for (let i = 0; i < 6 && (await dialogue()).nodeId !== nodeId; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    assert.equal((await dialogue()).nodeId, nodeId);
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
    const d = window.__mistwoodDebug;
    d.setQuestCompleted('quest_dawn_003');
    d.setQuestCompleted('quest_dawn_007');
    d.setQuestCompleted('quest_forest_003');
  });

  await check('苔冠下的守衛之後，向奧林接下「湖面不肯忘記」', async () => {
    await talkTo('orin');
    assert.equal((await dialogue()).dialogueId, 'orin_lake_offer');
    await advanceTo('ask');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '倒影' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
  });

  await check('澄鏡湖的湖畔營地：伊芙（水獺）說起營地前的倒影', async () => {
    await talkTo('eve');
    assert.equal((await dialogue()).dialogueId, 'eve_reflection');
    assert.ok(await debug(() => window.__mistwoodDebug.npcState('eve') !== null));
    await closeDialogue();
  });

  await check('調查三處倒影：每處顯示倒影裡的景象（三道波浪），倒影淡下來；任務可以回報', async () => {
    for (const [id, side] of [
      ['mirrorlake_reflection_camp', [-1, 0]],
      ['mirrorlake_reflection_isle', [0, -1]],
      ['mirrorlake_reflection_ruins', [0, 1]],
    ]) {
      const p = P(id);
      // 營地的倒影在水邊：從岸上（2 m 外）調查，不必下水
      await teleport(p.position[0] + side[0] * 2, p.position[2] + side[1] * 2, 900);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await target(id);
      assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /調查\s*不自然的倒影/);
      await page.keyboard.press('KeyE');
      const dialog = page.locator('[data-testid="message-dialog"]');
      await dialog.waitFor({ timeout: 3000 });
      assert.match(await dialog.innerText(), /三道/);
      await page.keyboard.press('KeyE');
      await dialog.waitFor({ state: 'detached', timeout: 2000 });
      assert.equal((await objectState(id))?.active, true);
    }
    assert.equal((await debug(() => window.__mistwoodDebug.playerState())).respawnCount, 0);
    assert.equal(await debug((q) => window.__mistwoodDebug.questProgress(q), Q), 3);
  });

  await check('回報奧林：「潮」的符號，拿到水鏡符號紀錄', async () => {
    await talkTo('orin');
    assert.equal((await dialogue()).dialogueId, 'orin_lake_turnin');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '三道波浪' }).click();
    await page.waitForTimeout(300);
    assert.equal((await dialogue()).nodeId, 'symbol');
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('mirror_symbol_record'), 1);
  });
});
