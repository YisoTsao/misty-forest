// 端對端：任務 5C — 手把（規格 6.1 P1）。以除錯 API 模擬 standard mapping 的手把狀態（自動化環境沒有實體手把），
// 經過與實體手把相同的輸入層：左搖桿移動、右搖桿視角、按鈕對應動作、提示改顯示手把按鈕、
// 選單導覽（十字鍵選按鈕、A 確認、B 返回、Start 暫停）、對話選項、背包開關，以及改用鍵盤後提示換回鍵盤。
// 用法：pnpm build && node e2e/gamepad.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { placements, runE2e } from './lib.mjs';

const chest = placements.find((p) => p.prefabId === 'chest_wood');
const PAD = { A: 0, B: 1, X: 2, Y: 3, Back: 8, Start: 9, Up: 12, Down: 13 };

await runE2e('gamepad e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, state, teleport, interactTarget }) => {
  const setPad = (pad) => debug((p) => window.__mistwoodDebug.setPad(p), pad);
  const idle = () => setPad({});
  /** 按一下手把按鈕（按下 → 放開，各維持數幀讓輪詢讀到） */
  const press = async (button) => {
    const buttons = [];
    buttons[button] = 1;
    await setPad({ buttons });
    await page.waitForTimeout(120);
    await idle();
    await page.waitForTimeout(120);
  };
  const padFocus = () => debug(() => window.__mistwoodDebug.padFocus());
  const prompt = page.locator('[data-testid="interact-prompt"]');

  await check('左搖桿往上推：角色往攝影機前方走，輕推比推到底慢；提示換成手把', async () => {
    await debug(() => window.__mistwoodDebug.resetWorld());
    await teleport(0, 0);
    await debug(() => window.__mistwoodDebug.camera({ yaw: 0, pitch: 0.35, distance: 6 }));
    await setPad({ axes: [0, -1] });
    await page.waitForTimeout(900);
    const full = await state();
    assert.ok(full.z < -1.5, `沒有往前走：z=${full.z.toFixed(2)}`);
    assert.equal(full.anim, 'walk');
    await setPad({ axes: [0, -0.45] });
    await page.waitForTimeout(600);
    const slow = await state();
    assert.ok(slow.speed > 0.2 && slow.speed < full.speed * 0.75, `輕推速度 ${slow.speed.toFixed(2)}，推到底 ${full.speed.toFixed(2)}`);
    await idle();
    assert.equal(await debug(() => window.__mistwoodDebug.inputDevice()), 'gamepad');
    // 手把不需要鎖定滑鼠：「點擊畫面開始操作」提示收起
    assert.equal(await page.locator('[data-testid="control-hint"]').count(), 0);
  });

  await check('B 按住跑步', async () => {
    const buttons = [];
    buttons[PAD.B] = 1;
    await setPad({ axes: [0, -1], buttons });
    await page.waitForTimeout(700);
    assert.equal((await state()).anim, 'run');
    await idle();
  });

  await check('右搖桿轉動視角', async () => {
    const before = await debug(() => window.__mistwoodDebug.cameraAngles());
    await setPad({ axes: [0, 0, 1, 0] });
    await page.waitForTimeout(500);
    await idle();
    const after = await debug(() => window.__mistwoodDebug.cameraAngles());
    assert.ok(Math.abs(after.yaw - before.yaw) > 0.5, `yaw ${before.yaw.toFixed(2)} → ${after.yaw.toFixed(2)}`);
  });

  await check('A 跳躍', async () => {
    await page.waitForTimeout(300);
    const y0 = (await state()).y;
    await setPad({ buttons: [1] });
    await page.waitForTimeout(180);
    await idle();
    const s = await state();
    assert.ok(!s.grounded && s.y > y0 + 0.3, `y ${y0.toFixed(2)} → ${s.y.toFixed(2)}`);
    await page.waitForTimeout(900);
  });

  await check('寶箱提示顯示「Y」；按 Y 打開，B 關閉訊息', async () => {
    const [cx, , cz] = chest.position;
    await teleport(cx + 0.5, cz + 1.4);
    await prompt.waitFor({ timeout: 3000 });
    assert.equal(await interactTarget(), chest.id);
    assert.match(await prompt.innerText(), /^Y\s*打開\s*寶箱/);
    await press(PAD.Y);
    await page.locator('[data-testid="message-dialog"]').waitFor({ timeout: 3000 });
    assert.equal(await debug(() => window.__mistwoodDebug.itemCount('starlight_shard')), 1);
    await press(PAD.B);
    await page.locator('[data-testid="message-dialog"]').waitFor({ state: 'detached', timeout: 2000 });
    // 露米出現後的打招呼也是訊息
    await page.waitForTimeout(300);
    for (let i = 0; i < 3 && (await page.locator('[data-testid="message-dialog"]').count()) > 0; i++) await press(PAD.B);
  });

  await check('View 開啟背包；選單中十字鍵選格子；再按 B 關閉', async () => {
    await press(PAD.Back);
    await page.locator('[data-testid="inventory"]').waitFor({ timeout: 2000 });
    await press(PAD.Down);
    assert.equal(await debug(() => document.querySelector('.pad-focus')?.getAttribute('data-testid')), 'inventory-slot');
    await press(PAD.B);
    await page.locator('[data-testid="inventory"]').waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('Start 暫停；十字鍵選到「繼續」，A 回到遊戲', async () => {
    await press(PAD.Start);
    await page.locator('[data-testid="pause-menu"]').waitFor({ timeout: 2000 });
    await press(PAD.Down);
    const first = await padFocus();
    assert.ok(first, '十字鍵沒有選到按鈕');
    // 往上移到最上面的「繼續」
    for (let i = 0; i < 5; i++) await press(PAD.Up);
    assert.match(await padFocus(), /繼續/);
    await press(PAD.A);
    await page.locator('[data-testid="pause-menu"]').waitFor({ state: 'detached', timeout: 2000 });
    assert.equal(await padFocus(), null, '回到遊戲後仍保留選取');
  });

  await check('與茉莉對話：Y 交談、十字鍵選「休息一下」、A 確認；B 結束對話', async () => {
    await teleport(1000 - 3.2, 1000 - 1.3, 400);
    await debug(() => window.__mistwoodDebug.face(1000 - 3.2, 1000 - 3.6));
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:molly', null, { timeout: 3000 });
    await press(PAD.Y);
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'greet', null, { timeout: 3000 });
    await press(PAD.Down);
    for (let i = 0; i < 4; i++) await press(PAD.Up);
    assert.match(await padFocus(), /休息一下/);
    await press(PAD.A);
    assert.equal(await debug(() => window.__mistwoodDebug.dialogue()?.nodeId), 'rested');
    // 沒有選項的節點：A 翻頁
    await press(PAD.A);
    assert.equal(await debug(() => window.__mistwoodDebug.dialogue()), null);
    await press(PAD.Y);
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue() !== null, null, { timeout: 3000 });
    await press(PAD.B);
    assert.equal(await debug(() => window.__mistwoodDebug.dialogue()), null);
  });

  await check('設定畫面列出手把配置', async () => {
    await press(PAD.Start);
    await page.locator('[data-testid="pause-settings"]').click();
    const text = await page.locator('[data-testid="settings-gamepad"]').innerText();
    assert.match(text, /攻擊\s*X/);
    assert.match(text, /互動 \/ 採集\s*Y/);
    await press(PAD.B);
    await press(PAD.B);
    await page.locator('[data-testid="pause-menu"]').waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('改用鍵盤後提示換回鍵盤按鍵', async () => {
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(200);
    assert.equal(await debug(() => window.__mistwoodDebug.inputDevice()), 'keyboard');
    assert.match(await page.locator('[data-testid="control-hint"]').innerText(), /W A S D/);
  });

  await setPad(null);
});
