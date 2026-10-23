// 端對端：第二章 Phase 3 — 翻滾閃避（規格 10.1）。
// 按 Z 翻滾：翻滾動作開始、冷卻中再按沒有效果；翻滾中敵人的攻擊不扣血，翻滾結束後照常受傷。
// 用法：pnpm build && node e2e/roll.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e } from './lib.mjs';

await runE2e('roll e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const rolling = () => debug(() => window.__mistwoodDebug.playerState().rolling);
  const hp = () => debug(() => window.__mistwoodDebug.combatState().hp);

  // 螢苔史萊姆的生成點（A 區）：翻滾與被攻擊都在這裡測
  await check('按 Z 翻滾：翻滾動作開始，約一瞬間後結束', async () => {
    await teleport(1880, -8 + 9, 900);
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().some((e) => e.kind === 'mob_moss_slime'), null, { timeout: 25000 });
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === true, null, { timeout: 1000 });
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === false, null, { timeout: 2000 });
  });

  await check('冷卻中再按 Z 沒有效果；冷卻過後可以再翻滾', async () => {
    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(150);
    assert.equal(await rolling(), false, '冷卻中不應該再翻滾');
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === true, null, { timeout: 1000 });
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === false, null, { timeout: 2000 });
  });

  await check('翻滾中被攻擊不扣血；翻滾結束後受到的攻擊照常扣血', async () => {
    await page.waitForTimeout(1500);
    await debug(() => window.__mistwoodDebug.setPeaceful(false));
    const hp0 = await hp();
    // 直接以權威指令模擬敵人出手：先找一隻敵人（沒有時就用第一個生成點附近的敵人）
    const enemy = (await debug(() => window.__mistwoodDebug.enemies())).find((e) => e.kind === 'mob_moss_slime' && e.hp > 0);
    assert.ok(enemy, '附近沒有敵人可以測試');
    await page.keyboard.press('KeyZ');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === true, null, { timeout: 3000 });
    await send({ type: 'EnemyStrike', enemyId: enemy.id });
    await page.waitForTimeout(100);
    assert.equal(await hp(), hp0, '翻滾中不應該扣血');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().rolling === false, null, { timeout: 2000 });
    await page.waitForTimeout(1200);
    await send({ type: 'EnemyStrike', enemyId: enemy.id });
    await page.waitForTimeout(100);
    assert.ok((await hp()) < hp0, '翻滾結束後應該受傷');
    await debug(() => window.__mistwoodDebug.setPeaceful(true));
  });
});
