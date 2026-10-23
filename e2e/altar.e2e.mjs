// 端對端：第二章 Phase 4 — 古樹祭壇與根噬者（規格 B-01、G 區、CH2-MQ-07）。
// 接下 quest_forest_007 後走進祭壇的戰場，把根噬者打到只剩 1 點 → 進入淨化（不會死）；
// 依序點亮三座古樹共鳴石柱 → 根噬者被淨化、打倒只結算一次；回報菇菇婆婆後任務完成。
// 用法：pnpm build && node e2e/altar.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
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
    void itemCount;
    void objectState;
  });
});
