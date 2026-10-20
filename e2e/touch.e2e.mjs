// 端對端：任務 11M — 手機版的觸控操作（使用者 2026-10-20：虛擬搖桿、支援橫向與直向）。
// 以 ?touch=1 打開觸控介面，視窗改成手機大小（橫向 844×390、直向 390×844），用 CDP 送出真正的觸控事件：
// 左半邊的浮動搖桿走路與跑步、右半邊拖曳轉視角、雙指縮放、攻擊與跳躍鈕、點互動提示開寶箱、背包與暫停鈕、
// 兩種方向的 HUD 都在畫面內且不互相重疊。截圖存在 docs/screenshots/mobile/。
// 用法：pnpm build && node e2e/touch.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const chest = placements.find((p) => p.id === 'meadow_chest_001');
const shots = 'docs/screenshots/mobile';
mkdirSync(shots, { recursive: true });

await runE2e('touch e2e', { query: 'debug=1&play=1&peaceful=1&touch=1&quality=low' }, async ({ app, page, check, debug, state, teleport }) => {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  /** 一根手指從 from 拖到 to（steps 段），按住 holdMs 後放開 */
  const drag = async (from, to, { steps = 8, holdMs = 0 } = {}) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
      await page.waitForTimeout(16);
    }
    if (holdMs) await page.waitForTimeout(holdMs);
    await touch('touchEnd', []);
  };
  const tapAt = async (x, y) => {
    await touch('touchStart', [[x, y]]);
    await page.waitForTimeout(60);
    await touch('touchEnd', []);
  };
  const center = async (testId) => {
    const box = await page.getByTestId(testId).boundingBox();
    assert.ok(box, `${testId} 不在畫面上`);
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const tap = async (testId) => tapAt(...(await center(testId)));
  const resize = async (w, h) => {
    await app.evaluate(({ BrowserWindow }, [cw, ch]) => BrowserWindow.getAllWindows()[0].setContentSize(cw, ch), [w, h]);
    await page.waitForFunction(([cw, ch]) => window.innerWidth === cw && window.innerHeight === ch, [w, h], { timeout: 4000 });
    await page.waitForTimeout(600);
  };
  const viewport = () => debug(() => ({ w: window.innerWidth, h: window.innerHeight }));
  /** 這些元素都在畫面內，而且兩兩不重疊 */
  const assertLayout = async (ids) => {
    const { w, h } = await viewport();
    const boxes = [];
    for (const id of ids) {
      const box = await page.getByTestId(id).first().boundingBox();
      if (!box) continue;
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= w + 1 && box.y + box.height <= h + 1, `${id} 超出畫面：${JSON.stringify(box)}（畫面 ${w}×${h}）`);
      boxes.push({ id, ...box });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2;
        assert.ok(!overlap, `${a.id} 與 ${b.id} 重疊`);
      }
    }
  };
  const HUD = ['hp-bar', 'minimap', 'touch-menu', 'touch-attack', 'touch-heavy', 'touch-jump', 'touch-interact', 'touch-skill', 'tutorial'];

  await check('橫向（844×390）：觸控介面出現，沒有鍵盤提示；血條在左上', async () => {
    await resize(844, 390);
    for (const id of ['touch-surface', 'touch-buttons', 'touch-menu', 'touch-joystick']) assert.equal(await page.getByTestId(id).count(), 1, id);
    assert.equal(await page.getByTestId('control-hint').count(), 0);
    const hp = await page.getByTestId('hp-bar').boundingBox();
    assert.ok(hp && hp.y < 60, `血條在 y = ${hp?.y}`);
    assert.match(await page.getByTestId('tutorial').innerText(), /搖桿/);
    await page.screenshot({ path: `${shots}/landscape_hud.png` });
  });

  await check('橫向：HUD 都在畫面內、互不重疊', async () => {
    await assertLayout(HUD);
  });

  await check('左半邊的搖桿：往上推往前走，推到外圈跑步，放開就停', async () => {
    await teleport(0, 18, 900);
    const { h } = await viewport();
    const before = await state();
    await drag([120, h - 110], [120, h - 150], { holdMs: 1200 });
    const walked = await state();
    const walk = Math.hypot(walked.x - before.x, walked.z - before.z);
    assert.ok(walk > 1.5, `只走了 ${walk.toFixed(2)} m`);
    await page.waitForTimeout(500);
    const stopped = await state();
    assert.ok(stopped.speed < 0.5, `放開後速度 ${stopped.speed}`);
    // 推到外圈（超過半徑）：跑步比走路快
    await drag([120, h - 110], [120, h - 260], { holdMs: 1200 });
    const ran = await state();
    const run = Math.hypot(ran.x - stopped.x, ran.z - stopped.z);
    assert.ok(run > walk * 1.3, `跑 ${run.toFixed(2)} m，走 ${walk.toFixed(2)} m`);
  });

  await check('右半邊拖曳轉視角；雙指張開拉近', async () => {
    const { w, h } = await viewport();
    const before = await debug(() => window.__mistwoodDebug.cameraAngles());
    await drag([w * 0.65, h * 0.4], [w * 0.65 + 120, h * 0.4]);
    await page.waitForTimeout(200);
    const turned = await debug(() => window.__mistwoodDebug.cameraAngles());
    assert.ok(Math.abs(turned.yaw - before.yaw) > 0.2, `視角只轉了 ${(turned.yaw - before.yaw).toFixed(3)}`);
    await touch('touchStart', [
      [w * 0.6, h * 0.5],
      [w * 0.7, h * 0.5],
    ]);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [
        [w * 0.6 - i * 12, h * 0.5],
        [w * 0.7 + i * 12, h * 0.5],
      ]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(300);
    const zoomed = await debug(() => window.__mistwoodDebug.cameraAngles());
    assert.ok(zoomed.distance < turned.distance - 0.5, `距離 ${turned.distance.toFixed(2)} → ${zoomed.distance.toFixed(2)}`);
  });

  await check('跳躍鈕讓角色離開地面；攻擊鈕出招（不會被當成滑鼠點擊去鎖定滑鼠）', async () => {
    await page.waitForTimeout(400);
    await tap('touch-jump');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().grounded === false, null, { timeout: 1500 });
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().grounded === true, null, { timeout: 3000 });
    await tap('touch-attack');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().action !== null, null, { timeout: 1500 });
    assert.equal(await debug(() => document.pointerLockElement), null);
  });

  await check('走近寶箱：互動鈕亮起，點互動提示就打開', async () => {
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
    const yaw = chest.rotation[1];
    await teleport(chest.position[0] + Math.sin(yaw) * 1.5, chest.position[2] + Math.cos(yaw) * 1.5, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [chest.position[0], chest.position[2]]);
    await page.getByTestId('interact-prompt').waitFor({ timeout: 3000 });
    assert.match((await page.getByTestId('touch-interact').getAttribute('class')) ?? '', /amber/);
    await tap('interact-prompt');
    await page.waitForFunction((id) => window.__mistwoodDebug.objectState(id)?.open === true, chest.id, { timeout: 3000 });
    // 序章寶箱的紙條：點「繼續」關掉（訊息視窗開著時觸控按鈕收起來）
    const dialog = page.getByTestId('message-dialog');
    await dialog.waitFor({ timeout: 3000 });
    assert.equal(await page.getByTestId('touch-buttons').count(), 0);
    await tap('message-dialog-close');
    await dialog.waitFor({ state: 'detached', timeout: 3000 });
    await page.getByTestId('touch-attack').waitFor({ timeout: 2000 });
  });

  await check('背包鈕打開背包、點「關閉」關掉；暫停鈕打開暫停選單、點「繼續」回到遊戲', async () => {
    await tap('touch-inventory');
    await page.getByTestId('inventory').waitFor({ timeout: 2000 });
    await page.screenshot({ path: `${shots}/landscape_inventory.png` });
    await tap('inventory-close');
    await page.getByTestId('inventory').waitFor({ state: 'detached', timeout: 2000 });
    await tap('touch-pause');
    await page.getByTestId('pause-menu').waitFor({ timeout: 2000 });
    await page.screenshot({ path: `${shots}/landscape_pause.png` });
    await tap('pause-resume');
    await page.getByTestId('pause-menu').waitFor({ state: 'detached', timeout: 2000 });
    // 全程沒有碰鍵盤：介面仍是觸控
    assert.equal(await page.getByTestId('touch-buttons').count(), 1);
  });

  await check('直向（390×844）：HUD 都在畫面內、互不重疊；搖桿一樣能走', async () => {
    await resize(390, 844);
    await page.getByTestId('touch-attack').waitFor({ timeout: 2000 });
    await assertLayout(HUD.filter((id) => id !== 'tutorial'));
    await page.screenshot({ path: `${shots}/portrait_hud.png` });
    const before = await state();
    await drag([90, 700], [90, 640], { holdMs: 1000 });
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 1.2, '直向時搖桿沒有作用');
  });

  await check('直向：背包與暫停選單在畫面內', async () => {
    await tap('touch-inventory');
    const inv = page.getByTestId('inventory');
    await inv.waitFor({ timeout: 2000 });
    const box = await inv.boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= 391, `背包 ${JSON.stringify(box)}`);
    await page.screenshot({ path: `${shots}/portrait_inventory.png` });
    await tap('inventory-close');
    await inv.waitFor({ state: 'detached', timeout: 2000 });
    await tap('touch-pause');
    const menu = page.getByTestId('pause-menu');
    await menu.waitFor({ timeout: 2000 });
    const mbox = await menu.boundingBox();
    assert.ok(mbox && mbox.x >= -1 && mbox.x + mbox.width <= 391, `暫停選單 ${JSON.stringify(mbox)}`);
    await page.screenshot({ path: `${shots}/portrait_pause.png` });
    await tap('pause-resume');
    await menu.waitFor({ state: 'detached', timeout: 2000 });
  });
});
