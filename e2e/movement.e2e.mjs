// 端對端：在 Electron 正式版中以真實鍵盤事件驗證移動、跑步、跳躍、停止與動畫切換（任務 1B）。
// 用法：pnpm build && node e2e/movement.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { appEnv, focusGame, tempSaveDir } from './lib.mjs';
import { terrainHeight } from '../src/game-core/world/terrain.ts';

const app = await electron.launch({ args: ['.'], env: appEnv({ MISTWOOD_START_QUERY: 'debug=1&play=1', MISTWOOD_SAVE_DIR: tempSaveDir() }) });
const results = [];
let failed = false;

async function check(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failed = true;
    results.push(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

try {
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });
  await focusGame(page);
  const state = () => page.evaluate(() => window.__mistwoodDebug.playerState());
  const wait = (ms) => page.waitForTimeout(ms);

  await wait(800); // 讓角色落地穩定

  await check('出生後站在地面上、播放 idle', async () => {
    const s = await state();
    assert.equal(s.grounded, true, `grounded=${s.grounded}`);
    assert.equal(s.anim, 'idle');
  });

  await check('按住 W 往攝影機前方（-Z）走、播放 walk、速度約為 walkSpeed', async () => {
    const before = await state();
    await page.keyboard.down('KeyW');
    await wait(1000);
    const mid = await state();
    await page.keyboard.up('KeyW');
    assert.equal(mid.anim, 'walk');
    assert.ok(mid.z < before.z - 2, `z ${before.z.toFixed(2)} → ${mid.z.toFixed(2)}`);
    assert.ok(Math.abs(mid.x - before.x) < 0.3, `x 偏移 ${(mid.x - before.x).toFixed(2)}`);
    assert.ok(Math.abs(mid.speed - 3.0) < 0.2, `speed=${mid.speed.toFixed(2)}`);
  });

  await check('放開後 0.3 秒內停止並回到 idle（不滑行）', async () => {
    await wait(300);
    const a = await state();
    await wait(300);
    const b = await state();
    assert.equal(a.anim, 'idle');
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 0.01, '停止後仍在移動');
  });

  await check('Shift + W 跑步、播放 run、速度約為 runSpeed', async () => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await wait(800);
    const s = await state();
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    assert.equal(s.anim, 'run');
    assert.ok(Math.abs(s.speed - 6.2) < 0.3, `speed=${s.speed.toFixed(2)}`);
  });

  await check('斜向（W + D）速度不超過直線', async () => {
    await wait(400);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyD');
    await wait(700);
    const s = await state();
    await page.keyboard.up('KeyW');
    await page.keyboard.up('KeyD');
    assert.ok(s.speed <= 3.0 + 0.05, `speed=${s.speed.toFixed(3)}`);
  });

  await check('Space 跳躍：離地上升、播放 jump，之後落地', async () => {
    await wait(500);
    const ground = await state();
    await page.keyboard.press('Space');
    await wait(150);
    const air = await state();
    assert.equal(air.grounded, false, '沒有離地');
    assert.ok(air.y > ground.y + 0.3, `y ${ground.y.toFixed(2)} → ${air.y.toFixed(2)}`);
    assert.ok(['jump', 'fall'].includes(air.anim), `anim=${air.anim}`);
    await wait(1500);
    const landed = await state();
    assert.equal(landed.grounded, true, '沒有落地');
    assert.equal(landed.anim, 'idle');
    assert.ok(Math.abs(landed.y - ground.y) < 0.15, `落地高度 ${landed.y.toFixed(2)} vs ${ground.y.toFixed(2)}`);
  });

  await check('空中連按不會二段跳', async () => {
    await page.keyboard.press('Space');
    await wait(120);
    const first = await state();
    await page.keyboard.press('Space');
    await wait(300);
    const peak = await state();
    await wait(1500);
    assert.ok(peak.y < first.y + 1.8, `高度異常 ${first.y.toFixed(2)} → ${peak.y.toFixed(2)}`);
  });

  await check('跑過起伏地形 6 秒：始終貼地、不穿過地面', async () => {
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyA');
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await wait(500);
      const s = await state();
      // 膠囊中心到腳底 = halfHeight + radius = 0.78
      samples.push({ clearance: s.y - 0.78 - terrainHeight(s.x, s.z), grounded: s.grounded });
    }
    await page.keyboard.up('KeyA');
    await page.keyboard.up('ShiftLeft');
    const minClear = Math.min(...samples.map((s) => s.clearance));
    const maxClear = Math.max(...samples.map((s) => s.clearance));
    assert.ok(minClear > -0.1, `腳底低於地面 ${minClear.toFixed(3)}`);
    assert.ok(maxClear < 0.3, `腳底浮空 ${maxClear.toFixed(3)}`);
    assert.ok(samples.filter((s) => s.grounded).length >= 10, '移動途中常失去地面接觸');
  });

  const camera = (set) => page.evaluate((s) => window.__mistwoodDebug.camera(s), set);

  await check('平地上攝影機維持設定距離（沒有被誤判拉近）', async () => {
    await page.evaluate(() => window.__mistwoodDebug.teleport(0, 18));
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await wait(1200);
    const c = await camera();
    const p = await state();
    const dist = Math.hypot(c.x - p.x, c.y - (p.y + 0.55), c.z - p.z);
    assert.ok(Math.abs(dist - 6) < 0.3, `距離 ${dist.toFixed(2)}`);
  });

  await check('攝影機背後是陡坡時自動拉近，不鑽進地面', async () => {
    // 地圖東緣是往外升高的丘陵；攝影機放在東側、低仰角、最遠距離，沒有避讓就會在地底
    await page.evaluate(() => window.__mistwoodDebug.teleport(62, 0));
    await camera({ yaw: Math.PI / 2, pitch: -0.1, distance: 12 });
    await wait(1500);
    const c = await camera();
    const p = await state();
    const naiveX = p.x + 12 * Math.cos(-0.1);
    const naiveY = p.y + 0.55 + 12 * Math.sin(-0.1);
    assert.ok(naiveY < terrainHeight(naiveX, p.z), '測試前提不成立：未避讓的位置本來就在地面上');
    const clearance = c.y - terrainHeight(c.x, c.z);
    assert.ok(clearance > 0.05, `攝影機低於地面 ${clearance.toFixed(3)}`);
    const dist = Math.hypot(c.x - p.x, c.y - (p.y + 0.55), c.z - p.z);
    assert.ok(dist < 11, `沒有拉近（距離 ${dist.toFixed(2)}）`);
  });

  await check('掉出地圖後回到最近的安全點（不是出生點），且站在地面上', async () => {
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    // 從東側沿 z = 0 走到東邊的邊界牆（任務 6A：走不出去），沿途記錄安全點；
    // 再以除錯傳送到地圖邊緣之外模擬掉落，應回到東緣內側
    await page.evaluate(() => window.__mistwoodDebug.teleport(60, 0));
    await wait(600);
    const before = await state();
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyD');
    // 跑到牆邊為止（機器忙碌、幀率低時跑得比較慢，不用固定秒數）
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().x > 72, null, { timeout: 8000 }).catch(() => {});
    await wait(600);
    await page.keyboard.up('KeyD');
    await page.keyboard.up('ShiftLeft');
    await wait(500);
    const atWall = await state();
    assert.equal(atWall.respawnCount, before.respawnCount, '走到邊界時不應掉落');
    assert.ok(atWall.x > 70 && atWall.x < 74, `沒有停在東邊界：x=${atWall.x.toFixed(2)}`);
    await page.evaluate(() => window.__mistwoodDebug.teleport(86, 0));
    await page.waitForFunction((n) => window.__mistwoodDebug.playerState().respawnCount > n, before.respawnCount, {
      timeout: 10_000,
    });
    await wait(800);
    const s = await state();
    assert.equal(s.grounded, true, '重置後沒有站在地面上');
    assert.ok(s.x > 60 && s.x <= 74.5, `重置位置 x=${s.x.toFixed(2)}（應在東緣內側，非出生點）`);
    assert.ok(Math.abs(s.z) < 2, `重置位置 z=${s.z.toFixed(2)}`);
    const clearance = s.y - 0.78 - terrainHeight(s.x, s.z);
    assert.ok(clearance > -0.1 && clearance < 0.3, `腳底與地面距離 ${clearance.toFixed(3)}`);
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await app.close();
}

console.log(`movement e2e\n${results.join('\n')}`);
process.exit(failed ? 1 : 0);
