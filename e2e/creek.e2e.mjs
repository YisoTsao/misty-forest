// 端對端：第二章 Phase 2 — 倒流溪谷（規格 P-02）。
// 溪谷的石障擋著上游；先讀石碑（答案：1、3、2 格），再按 E 轉三座水輪；轉錯時石障不開，全部對準後石障退開。
// 存檔重開後水輪的位置與石障狀態都還在。外觀以截圖檢查（glowmoss_creek、glowmoss_barrier）。
// 用法：pnpm build && node e2e/creek.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const at = (id) => placements.find((p) => p.id === id);
const WHEELS = ['creek_wheel_01', 'creek_wheel_02', 'creek_wheel_03'];

await runE2e('creek e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, teleport, objectState }) => {
  const dialog = page.locator('[data-testid="message-dialog"]');
  const approach = async (p, expected) => {
    await teleport(p.position[0] + 1.6, p.position[2] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  const turnOf = async (id) => (await objectState(id))?.turn ?? 0;
  /** 轉一格：等提示出現、按 E、等指令送出後轉動位置加一（指令有 0.45 秒的動作延遲） */
  const turnOnce = async (id) => {
    const before = await turnOf(id);
    await page.waitForFunction((x) => window.__mistwoodDebug.interactTarget() === x, id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(([x, n]) => (window.__mistwoodDebug.objectState(x)?.turn ?? 0) === n + 1, [id, before], { timeout: 3000 });
  };

  await check('石障擋著溪谷：沒有轉動水輪前，石障還在', async () => {
    assert.notEqual((await objectState('creek_barrier'))?.active, true);
  });

  await check('石碑寫著答案，讀得到', async () => {
    const tablet = at('creek_tablet');
    await approach(tablet, 'creek_tablet');
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /第一座木輪轉一格[\s\S]*第二座轉三格[\s\S]*最後一座轉兩格/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('轉錯的時候石障不開（只轉第一座）', async () => {
    await approach(at(WHEELS[0]), WHEELS[0]);
    await turnOnce(WHEELS[0]);
    assert.equal(await turnOf(WHEELS[0]), 1);
    assert.notEqual((await objectState('creek_barrier'))?.active, true);
  });

  await check('依答案轉到位（第二座 3 格、第三座 2 格）：石障退開', async () => {
    for (const [id, times] of [[WHEELS[1], 3], [WHEELS[2], 2]]) {
      await approach(at(id), id);
      for (let i = 0; i < times; i++) await turnOnce(id);
      assert.equal(await turnOf(id), times, id);
    }
    await page.waitForFunction(() => window.__mistwoodDebug.objectState('creek_barrier')?.active === true, null, { timeout: 3000 });
    assert.equal(await turnOf(WHEELS[0]), 1);
  });

  await check('存檔：水輪位置與石障狀態寫進存檔', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    const barrier = data.world.objects.find((o) => o.placementId === 'creek_barrier');
    assert.equal(barrier?.active, true);
    assert.equal(data.world.objects.find((o) => o.placementId === 'creek_wheel_02')?.turn, 3);
  });
});

await runE2e('creek e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, objectState }) => {
  await check('讀檔後石障仍是開的，水輪位置保留', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(1500);
    assert.equal((await objectState('creek_barrier'))?.active, true);
    assert.equal((await objectState('creek_wheel_02'))?.turn, 3);
  });
});
