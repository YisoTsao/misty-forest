// 端對端：任務 9D — quest_lake_002「把水送回遠方」（Bible §7.4）。
// 向奇奇接取 → 曙光石亮起、光束照到第一面水鏡 → 按 E 轉動水鏡（每次 90 度）直到光照到下一面 → 光照到湖底閘門：閘門打開、提示
// → 回報奇奇得到水行護符 → 帶著護符可以走進較深的水裡（沒有護符時會落水）。
// 用法：pnpm build && node e2e/lightpuzzle.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const light = JSON.parse(readFileSync('src/data/lightPaths.json', 'utf8'))[0];
const Q = 'quest_lake_002';
const P = (id) => placements.find((p) => p.id === id);
const O = { x: 4000, z: 0 };

await runE2e('lightpuzzle e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, state, teleport, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const dialogue = () => debug(() => window.__mistwoodDebug.dialogue());
  const lightPath = () => debug(() => window.__mistwoodDebug.lightPath());
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
    for (const q of ['quest_dawn_003', 'quest_forest_003', 'quest_lake_001']) d.setQuestCompleted(q);
  });

  await check('沒接任務時按 E 轉水鏡：提示還不能轉', async () => {
    const m = P(light.mirrors[0]);
    await teleport(m.position[0] + 2, m.position[2], 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [m.position[0], m.position[2]]);
    await target(m.id);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    assert.equal((await objectState(m.id))?.turn ?? 0, 0);
    assert.equal((await lightPath()).beams, 0, '任務開始前曙光石不亮');
  });

  await check('向奇奇接下「把水送回遠方」', async () => {
    await talkTo('kiki');
    assert.equal((await dialogue()).dialogueId, 'kiki_lake_offer');
    await advanceTo('plan');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '光送到閘門' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
  });

  await check('曙光石亮起：光束照到第一面水鏡（場景上畫出光束）', async () => {
    const m = P(light.mirrors[0]);
    await teleport(m.position[0] + 2, m.position[2], 1200);
    const lp = await lightPath();
    assert.equal(lp.lit, 1);
    assert.ok(lp.beams >= 2, `光束 ${lp.beams}`);
  });

  await check('按 E 轉動三面水鏡（每次 90 度），光一路照到湖底閘門：閘門打開', async () => {
    for (const [i, id] of light.mirrors.entries()) {
      const m = P(id);
      let turns = 0;
      while ((await lightPath()).lit < i + 2 && !(await lightPath()).solved && turns < 4) {
        // 每次都站回鏡子旁（遺構附近的鏡殼蟹會把人擠開）
        await teleport(m.position[0] + 2, m.position[2] + 0.5, 500);
        await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [m.position[0], m.position[2]]);
        await target(id);
        await page.keyboard.press('KeyE');
        await page.waitForTimeout(500);
        turns++;
      }
      assert.ok(turns > 0 && turns < 4, `${id} 轉了 ${turns} 次`);
    }
    const lp = await lightPath();
    assert.equal(lp.solved, true);
    assert.equal(lp.beams, light.mirrors.length + 1);
    await page.waitForTimeout(300);
    assert.equal((await objectState(light.target))?.active, true);
    assert.ok((await debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey))).includes('toast.sluiceOpen'));
  });

  await check('沒有水行護符時走進深水會落水', async () => {
    const before = (await state()).respawnCount;
    await teleport(O.x - 30, O.z + 30, 1500);
    assert.equal((await state()).respawnCount, before + 1);
  });

  await check('回報奇奇得到水行護符；帶著它可以走進較深的水裡', async () => {
    await talkTo('kiki');
    assert.equal((await dialogue()).dialogueId, 'kiki_lake_turnin');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '閘門' }).click();
    await closeDialogue();
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('water_charm'), 1);
    // 碼頭盡頭外的水裡（水深約 1 m，超過不帶護符時的 60 cm）：有護符不會落水
    const before = (await state()).respawnCount;
    await teleport(O.x - 66, O.z + 27, 1500);
    const s = await state();
    assert.equal(s.respawnCount, before, '帶著護符仍然落水');
  });
});
