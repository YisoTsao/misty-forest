// 端對端：以開發模式（Vite dev server + React StrictMode）啟動，模擬實際試玩——
// 主選單 → 開始 → 點擊鎖定滑鼠、轉動視角、邊走邊轉 → Esc 暫停 → 繼續 → 回主選單 → 再開始，
// 確認渲染迴圈持續運作且沒有任何未捕捉的錯誤（規格 Phase 1：可連續遊玩並回主選單）。
// StrictMode 會「掛載 → 卸載 → 再掛載」，正式版不會，因此資源生命週期錯誤只會在這裡出現。
// 用法：node e2e/dev.e2e.mjs（不需要先 build）
/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { port: 5299, strictPort: false } });
await server.listen();
const url = server.resolvedUrls?.local[0];
assert.ok(url, 'Vite dev server 未回傳網址');

const app = await electron.launch({ args: ['.'], env: { ...process.env, VITE_DEV_SERVER_URL: url } });
const results = [];
const pageErrors = [];
let failed = false;

/** 只在環境不允許時使用：記錄為略過（不算通過），並說明原因 */
function skip(name, reason) {
  results.push(`  – ${name}（略過：${reason}）`);
}

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
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 90_000 });
  await page.bringToFront();
  await page.evaluate(() => {
    window.__frames = 0;
    const tick = () => {
      window.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const snapshot = () =>
    page.evaluate(() => ({
      cam: window.__mistwoodDebug.camera(),
      player: window.__mistwoodDebug.playerState(),
      locked: document.pointerLockElement !== null,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent),
    }));

  const box = await page.locator('canvas').boundingBox();
  let mx = box.x + box.width / 2;
  let my = box.y + box.height / 2;
  const title = page.locator('[data-testid="title-screen"]');
  const pause = page.locator('[data-testid="pause-menu"]');
  const spawn = await snapshot();

  await check('啟動後顯示主選單，主選單中角色不受鍵盤控制', async () => {
    await title.waitFor({ timeout: 5000 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const s = await snapshot();
    assert.ok(Math.hypot(s.player.x - spawn.player.x, s.player.z - spawn.player.z) < 0.05, '主選單中角色移動了');
  });

  await check('按「開始遊戲」進入遊戲', async () => {
    await page.locator('[data-testid="title-start"]').click();
    await title.waitFor({ state: 'detached', timeout: 3000 });
  });

  // 滑鼠鎖定需要視窗在作業系統前景；開發機正在使用其他視窗時 Chromium 會拒絕（WrongDocumentError）
  await page.mouse.click(mx, my);
  await page.waitForTimeout(400);
  const lockAvailable = (await snapshot()).locked;
  const turn = async (dx, dy) => {
    if (lockAvailable) {
      mx += dx;
      my += dy;
      await page.mouse.move(mx, my);
    } else {
      // 與滑鼠相同的換算（FollowCamera SENSITIVITY = 0.0025 rad/px）
      await page.evaluate(
        ([ddx, ddy]) => {
          const c = window.__mistwoodDebug.cameraAngles();
          window.__mistwoodDebug.camera({ yaw: c.yaw - ddx * 0.0025, pitch: c.pitch + ddy * 0.0025 });
        },
        [dx, dy],
      );
    }
  };

  if (lockAvailable) {
    await check('點擊畫面鎖定滑鼠', async () => {
      assert.equal((await snapshot()).locked, true);
    });
  } else {
    skip('點擊畫面鎖定滑鼠', '測試視窗不在作業系統前景，無法鎖定滑鼠；以除錯 API 轉動攝影機繼續測試');
  }

  await check('轉動視角後攝影機跟著轉，畫面持續更新', async () => {
    const before = await snapshot();
    for (let i = 0; i < 30; i++) await turn(20, i < 15 ? 4 : -4);
    await page.waitForTimeout(300);
    const after = await snapshot();
    const moved = Math.hypot(after.cam.x - before.cam.x, after.cam.z - before.cam.z);
    assert.ok(moved > 1, `攝影機只移動了 ${moved.toFixed(2)}`);
  });

  await check('邊走邊轉 5 秒：角色持續移動、每秒仍有足夠幀數', async () => {
    const f0 = await page.evaluate(() => window.__frames);
    const start = (await snapshot()).player;
    await page.keyboard.down('KeyW');
    let travelled = 0;
    let last = start;
    for (let i = 0; i < 20; i++) {
      for (let k = 0; k < 5; k++) await turn(12, 0);
      await page.waitForTimeout(250);
      const s = (await snapshot()).player;
      travelled += Math.hypot(s.x - last.x, s.z - last.z);
      last = s;
    }
    await page.keyboard.up('KeyW');
    const frames = (await page.evaluate(() => window.__frames)) - f0;
    assert.ok(travelled > 8, `5 秒只移動了 ${travelled.toFixed(2)} m`);
    assert.ok(frames > 5 * 20, `5 秒只渲染了 ${frames} 幀`);
  });

  await check('Esc 開啟暫停選單；暫停中角色不會移動', async () => {
    await page.keyboard.press('Escape');
    await pause.waitFor({ timeout: 3000 });
    const before = (await snapshot()).player;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    const after = (await snapshot()).player;
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.01, '暫停中角色仍在移動');
  });

  await check('按「繼續遊戲」關閉暫停選單並可再次移動', async () => {
    await page.locator('[data-testid="pause-resume"]').click();
    await pause.waitFor({ state: 'detached', timeout: 3000 });
    const before = (await snapshot()).player;
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const after = (await snapshot()).player;
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.8, '繼續後角色無法移動');
  });

  await check('暫停 →「回到主選單」→ 再開始：角色回到出生點', async () => {
    await page.keyboard.press('Escape');
    await pause.waitFor({ timeout: 3000 });
    await page.locator('[data-testid="pause-to-title"]').click();
    await title.waitFor({ timeout: 3000 });
    await page.locator('[data-testid="title-start"]').click();
    await title.waitFor({ state: 'detached', timeout: 3000 });
    await page.waitForTimeout(400);
    const s = (await snapshot()).player;
    assert.ok(Math.hypot(s.x - spawn.player.x, s.z - spawn.player.z) < 0.3, `沒有回到出生點：(${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
  });

  await check('沒有任何未捕捉的錯誤，也沒有錯誤提示', async () => {
    const s = await snapshot();
    assert.deepEqual(pageErrors.slice(0, 3), [], `pageerror（共 ${pageErrors.length} 個）`);
    assert.deepEqual(s.alerts, []);
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await app.close();
  await server.close();
}

console.log(`dev (StrictMode) e2e\n${results.join('\n')}`);
process.exit(failed ? 1 : 0);
