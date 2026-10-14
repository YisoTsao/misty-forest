// 端對端：任務 7M — 奧林與 quest_dawn_007「燈塔下的影子」（Bible §4.7、§22.1）。
// 燈塔點亮後向奧林接取 → 白天按 E 地窖門：說明要等夜裡 → 夜裡下到地窖（室內子場景）→ 撿三塊符號石片 → 放回石環 →
// 從石階上來 → 回報奧林（Bible 中期台詞）→ 共鳴石板。
// 用法：pnpm build && node e2e/cellar.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const Q = 'quest_dawn_007';
const P = (id) => placements.find((p) => p.id === id);

await runE2e('cellar e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const location = () => debug(() => window.__mistwoodDebug.location());
  const target = (id) => page.waitForFunction((t) => window.__mistwoodDebug.interactTarget() === t, id, { timeout: 3000 });
  const approach = async (id, side = [1, 0.3], distance = 1.2) => {
    const p = P(id);
    const len = Math.hypot(side[0], side[1]);
    await teleport(p.position[0] + (side[0] / len) * distance, p.position[2] + (side[1] / len) * distance, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
    await target(id);
  };
  const talkToOrin = async () => {
    const n = npcs.find((x) => x.id === 'orin');
    await teleport(n.position[0] + Math.sin(n.facingYaw) * 1.8, n.position[1] + Math.cos(n.facingYaw) * 1.8, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), n.position);
    await target('npc:orin');
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

  await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));

  await check('向奧林接下「燈塔下的影子」', async () => {
    await talkToOrin();
    assert.equal((await dialogue()).dialogueId, 'orin_shadow_offer');
    for (let i = 0; i < 4 && (await dialogue()).nodeId !== 'cellar'; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    await page.locator('[data-testid="dialogue-option"]', { hasText: '晚上去看看' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
  });

  await check('白天按 E 地窖門：說明要等夜裡，進不去', async () => {
    await approach('highland_cellar_hatch', [-1, 0], 1.3);
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /夜裡/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal(await location(), 'overworld');
  });

  await check('夜裡下到地窖（室內）', async () => {
    await debug(() => window.__mistwoodDebug.setClock(22));
    await approach('highland_cellar_hatch', [-1, 0], 1.3);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.location() === 'lighthouse_cellar', null, { timeout: 4000 });
    await page.waitForTimeout(800);
  });

  await check('撿三塊符號石片、放回石環', async () => {
    for (const id of ['cellar_symbol_dawn', 'cellar_symbol_sprout', 'cellar_symbol_tide']) {
      const p = P(id);
      // 從房間中央那一側走近
      await approach(id, [1100 - p.position[0], 1000 - p.position[2]], 1.1);
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(1300);
      assert.equal((await objectState(id))?.harvested, true, id);
    }
    await approach('cellar_stone_ring', [0, 1], 2);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
    assert.equal((await objectState('cellar_stone_ring'))?.active, true);
    assert.equal(await itemCount('symbol_stone_tide'), 0);
  });

  await check('從石階上來、回報奧林：中期台詞與共鳴石板', async () => {
    await approach('cellar_exit', [0, -1], 1.2);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.location() === 'overworld', null, { timeout: 4000 });
    await page.waitForTimeout(800);
    await talkToOrin();
    assert.equal((await dialogue()).dialogueId, 'orin_shadow_turnin');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '三塊石片都放回去了' }).click();
    for (let i = 0; i < 4 && (await dialogue())?.nodeId !== 'night'; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    assert.match(await box.innerText(), /靜夜結界/);
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('lore_tablet_resonance_01'), 1);
  });
});
