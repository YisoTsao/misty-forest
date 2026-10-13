// 端對端：任務 3B — NPC 與對話：互動提示、多段對話、選項、條件對話、對話中不能移動、Esc 結束、
// NPC 碰撞、巡邏與讓路。
// 用法：pnpm build && node e2e/npc.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const elder = npcs.find((n) => n.id === 'elder');

await runE2e('npc e2e', {}, async ({ page, check, debug, state, camera, teleport, interactTarget }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const node = () => box.getAttribute('data-node');
  const [ex, ez] = elder.position;

  await check('靠近村長米菈顯示「交談 村長米菈」', async () => {
    await teleport(ex, ez + 1.8);
    await page.waitForTimeout(300);
    assert.equal(await interactTarget(), 'npc:elder');
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /交談\s*村長米菈/);
  });

  await check('按 E 開始對話：顯示說話者與第一段，村長轉向玩家', async () => {
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    assert.equal(await page.locator('[data-testid="dialogue-speaker"]').innerText(), '村長米菈');
    assert.equal(await node(), 'greet');
    await page.waitForTimeout(800);
    const npc = await debug(() => window.__mistwoodDebug.npcState('elder'));
    const p = await state();
    const toPlayer = Math.atan2(p.x - npc.x, p.z - npc.z);
    assert.ok(npc.talking);
    assert.ok(Math.abs(Math.atan2(Math.sin(npc.yaw - toPlayer), Math.cos(npc.yaw - toPlayer))) < 0.2, `村長沒有面向玩家`);
  });

  await check('對話中按 W 不會移動', async () => {
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.02);
  });

  await check('空白鍵 / E 繼續，到達選項節點顯示 3 個選項', async () => {
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'tree');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'mist');
    assert.equal(await page.locator('[data-testid="dialogue-option"]').count(), 3);
  });

  await check('按 2 選「森林裡發生了什麼事？」→ 回答後回到選項', async () => {
    await page.keyboard.press('Digit2');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'forest');
    assert.match(await page.locator('[data-testid="dialogue-text"]').innerText(), /森林/);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'mist');
  });

  await check('點擊「我先四處看看。」結束對話，村長回到原本方向', async () => {
    await page.locator('[data-testid="dialogue-option"]', { hasText: '四處看看' }).click();
    await box.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal(await debug(() => window.__mistwoodDebug.dialogue()), null);
    assert.equal((await debug(() => window.__mistwoodDebug.npcState('elder'))).talking, false);
  });

  await check('對話中按 Esc 結束對話，不會開啟暫停選單', async () => {
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 0);
  });

  await check('條件對話：森林迷霧清除後村長說不同的話', async () => {
    await debug(() => window.__mistwoodDebug.setMistStage('forest', 'clear'));
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
    assert.match(await page.locator('[data-testid="dialogue-text"]').innerText(), /林子裡的霧散了/);
    await page.keyboard.press('Escape');
    await debug(() => window.__mistwoodDebug.setMistStage('forest', 'dense'));
  });

  await check('NPC 有碰撞：走向村長會被擋住', async () => {
    await teleport(ex, ez + 3);
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await page.keyboard.down('KeyW');
    let min = Infinity;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(80);
      const s = await state();
      min = Math.min(min, Math.hypot(s.x - ex, s.z - ez));
    }
    await page.keyboard.up('KeyW');
    assert.ok(min > 0.55, `穿進村長：最近距離 ${min.toFixed(2)}`);
  });

  await check('守衛雷歐在兩點之間巡邏（走路動畫）', async () => {
    await teleport(10, 10); // 遠離雷歐
    const a = await debug(() => window.__mistwoodDebug.npcState('leo'));
    let moved = 0;
    let walked = false;
    // 巡邏：走 6 m（約 5 秒）、兩端各停 4 秒；觀察 12 秒一定涵蓋一整段行走
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(500);
      const b = await debug(() => window.__mistwoodDebug.npcState('leo'));
      moved = Math.max(moved, Math.hypot(b.x - a.x, b.z - a.z));
      walked ||= b.walking;
    }
    assert.ok(moved > 2 && walked, `雷歐沒有巡邏：移動 ${moved.toFixed(2)}`);
  });

  await check('玩家擋在雷歐面前時他會停下來', async () => {
    const at = await debug(() => window.__mistwoodDebug.npcState('leo'));
    await teleport(at.x, at.z + 1.0, 300);
    const b1 = await debug(() => window.__mistwoodDebug.npcState('leo'));
    await page.waitForTimeout(1200);
    const b2 = await debug(() => window.__mistwoodDebug.npcState('leo'));
    assert.ok(Math.hypot(b2.x - b1.x, b2.z - b1.z) < 0.05, '雷歐沒有讓路');
    assert.equal(b2.walking, false);
  });
});
