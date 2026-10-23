// 端對端：第二章 Phase 4 — 星晶祕窟（規格 P-03）。
// 祕窟的石門擋著隱藏入口；石碑寫著答案（鏡 1 轉 2 次、鏡 2 轉 1 次、鏡 3 轉 1 次）；按 E 轉三面星晶鏡，
// 光照到石門時石門開；寶箱裡有古代共鳴石片。外觀以截圖檢查（glowmoss_crystal 書籤）。
// 用法：pnpm build && node e2e/crystal.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, runE2e } from './lib.mjs';

const at = (id) => placements.find((p) => p.id === id);
const MIRRORS = ['crystal_mirror_01', 'crystal_mirror_02', 'crystal_mirror_03'];

await runE2e('crystal e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, objectState, itemCount }) => {
  const dialog = page.locator('[data-testid="message-dialog"]');
  /** 從幾個方向靠近，哪一邊能互動就用哪一邊（祕窟的石頭與鏡子擋住某些角度） */
  const approach = async (p, expected) => {
    for (const [dx, dz] of [[1.2, 0.6], [-1.2, 0.6], [0, 1.2], [0, -1.2], [1.2, 0], [-1.2, 0]]) {
      await teleport(p.position[0] + dx, p.position[2] + dz, 800);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
      await page.waitForTimeout(250);
      if ((await debug(() => window.__mistwoodDebug.interactTarget())) === expected) return;
    }
    throw new Error(`靠近 ${expected} 的所有方向都互動不到`);
  };
  const turnOnce = async (id) => {
    const before = (await objectState(id))?.turn ?? 0;
    await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(([x, n]) => (window.__mistwoodDebug.objectState(x)?.turn ?? 0) === n + 1, [id, before], { timeout: 3000 });
  };

  await check('石門擋著祕窟的隱藏入口：一開始沒有開', async () => {
    assert.notEqual((await objectState('crystal_gate'))?.active, true);
  });

  await check('石碑寫著答案，讀得到', async () => {
    await approach(at('crystal_tablet'), 'crystal_tablet');
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /第一面鏡子轉兩次[\s\S]*第二面轉一次[\s\S]*最後一面再轉一次/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('依答案轉三面星晶鏡：光照到石門，石門開', async () => {
    const plan = [[MIRRORS[0], 2], [MIRRORS[1], 1], [MIRRORS[2], 1]];
    for (const [id, times] of plan) {
      await approach(at(id), id);
      for (let i = 0; i < times; i++) await turnOnce(id);
    }
    await page.waitForFunction(() => window.__mistwoodDebug.objectState('crystal_gate')?.active === true, null, { timeout: 3000 });
  });

  await check('祕窟的寶箱：打開後拿到古代共鳴石片', async () => {
    await approach(at('crystal_chest'), 'crystal_chest');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    assert.equal((await objectState('crystal_chest'))?.open, true);
    assert.equal(await itemCount('resonance_shard'), 1);
  });
});
