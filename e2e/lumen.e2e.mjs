// 端對端：第二章 Phase 3 — 星光照明（規格 10.2）與隱藏的寶箱。
// 沒有照明時打不開藏在花園石頭後面的寶箱；按 G 照明（扣星光值）後可以打開；照明結束後星光值與狀態正確。
// 用法：pnpm build && node e2e/lumen.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, runE2e } from './lib.mjs';

const cache = placements.find((p) => p.id === 'hidden_cache_01');

await runE2e('lumen e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, objectState, itemCount }) => {
  const approach = async (p) => {
    for (const [dx, dz] of [[1.2, 0.6], [-1.2, 0.6], [0, 1.2], [0, -1.2], [1.2, 0], [-1.2, 0]]) {
      await teleport(p.position[0] + dx, p.position[2] + dz, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await page.waitForTimeout(250);
      if ((await debug(() => window.__mistwoodDebug.interactTarget())) === p.id) return;
    }
    throw new Error(`靠近 ${p.id} 的所有方向都互動不到`);
  };

  await check('沒有照明時，隱藏的寶箱打不開', async () => {
    await approach(cache);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    assert.notEqual((await objectState(cache.id))?.open, true);
  });

  await check('按 G 照明：扣 15 點星光值，照明中', async () => {
    const mp0 = await debug(() => window.__mistwoodDebug.combatState().mp ?? null);
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().lumen === true, null, { timeout: 2000 });
    const mp1 = await debug(() => window.__mistwoodDebug.combatState().mp ?? null);
    if (mp0 !== null && mp1 !== null) assert.ok(mp0 - mp1 >= 14, `星光值 ${mp0} → ${mp1}`);
  });

  await check('照明中打開隱藏的寶箱：拿到戰利品', async () => {
    await approach(cache);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    assert.equal((await objectState(cache.id))?.open, true);
    assert.ok((await itemCount('starlight_shard')) >= 1);
  });
});
