// 端對端：任務 9A — 澄鏡湖（Bible §7，地圖三）。
// 螢苔祕林古樹祭壇東南往澄鏡湖的出口（任務 12B）：第一章完成前說明原因、不能通過（過渡條件 T-187）；完成後轉場到澄鏡湖北邊的林間水道出口，
// 顯示地圖與區域名稱；淺水石徑涉水走得過去、不會落水；走進深水會回到安全點（仍在澄鏡湖）；
// 月弧木橋走得上蘆葦島；水鏡神殿是濃霧；存檔重開後仍在澄鏡湖，從入口回到螢苔祕林。外觀以截圖檢查（mirrorlake_* 書籤）。
// 用法：pnpm build && node e2e/mirrorlake.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const O = { x: 4000, z: 0 };
const forestGate = placements.find((p) => p.id === 'glowmoss_gate_mirrorlake');
const lakeGate = placements.find((p) => p.id === 'mirrorlake_gate_glowmoss');
const inLake = (s) => Math.abs(s.x - O.x) < 170 && Math.abs(s.z - O.z) < 170;

/** 站在出入口前方 1.8 m、面向它 */
async function faceGate(gate, { page, debug }) {
  const yaw = gate.rotation[1];
  await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [gate.position[0] + Math.sin(yaw) * 1.8, gate.position[2] + Math.cos(yaw) * 1.8]);
  await page.waitForTimeout(900);
  await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [gate.position[0], gate.position[2]]);
  await page.waitForTimeout(300);
}

/** 面向 (tx, tz) 跑 ms 毫秒（攝影機轉到角色背後：W 依攝影機方向前進） */
async function runToward(page, debug, tx, tz, ms) {
  await debug(([x, z]) => {
    const d = window.__mistwoodDebug;
    d.face(x, z);
    const s = d.playerState();
    d.camera({ yaw: Math.atan2(x - s.x, z - s.z) - Math.PI });
  }, [tx, tz]);
  await page.waitForTimeout(200);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await page.waitForTimeout(300);
}

await runE2e('mirrorlake e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, state, teleport, interactTarget }) => {
  const currentMap = () => debug(() => window.__mistwoodDebug.currentMap());

  await check('螢苔祕林往澄鏡湖的入口：第一章還沒完成前說明原因、不能通過（過渡條件，T-187）', async () => {
    await faceGate(forestGate, { page, debug });
    assert.equal(await interactTarget(), 'glowmoss_gate_mirrorlake');
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /前往\s*林道出口：澄鏡湖/);
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /古樹記憶/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(900);
    assert.equal((await currentMap()).at, 'glowmoss');
  });

  await check('第一章完成後：轉場到澄鏡湖北邊的林間水道出口，站在地面上', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));
    // 第二章完成（古樹記憶找回）後湖邊的路才開（T-186）
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_008'));
    await faceGate(forestGate, { page, debug });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'mirrorlake', null, { timeout: 3000 });
    await page.waitForTimeout(1500);
    const s = await state();
    const yaw = lakeGate.rotation[1];
    const ax = lakeGate.position[0] + Math.sin(yaw) * 4;
    const az = lakeGate.position[2] + Math.cos(yaw) * 4;
    assert.ok(Math.hypot(s.x - ax, s.z - az) < 0.8, `抵達點 (${ax}, ${az})，實際 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded, '沒有站在地面上');
    assert.equal(s.respawnCount, 0);
    assert.deepEqual(await currentMap(), { at: 'mirrorlake', shown: 'mirrorlake' });
  });

  await check('顯示地圖名稱與區域名稱；小地圖換成澄鏡湖', async () => {
    const banner = page.locator('[data-testid="region-banner"]');
    await banner.waitFor({ timeout: 3000 });
    assert.match(await banner.innerText(), /澄鏡湖[\s\S]*澄鏡湖畔/);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'lake_shore');
    assert.match(await page.locator('[data-testid="minimap-region"]').innerText(), /澄鏡湖畔/);
    assert.ok((await debug(() => window.__mistwoodDebug.mapExplored('mirrorlake'))) > 0);
  });

  await check('淺水石徑：從營地涉水往湖心走，腳在水裡但不會落水', async () => {
    await teleport(O.x - 96, O.z + 12, 1200);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'lake_camp');
    const before = await state();
    await runToward(page, debug, O.x - 42, O.z + 16, 3500);
    const after = await state();
    assert.ok(after.x - before.x > 15, `只走了 ${(after.x - before.x).toFixed(1)} m`);
    // 營地地面約 +0.4 m，石徑的水底在水面下 25 cm：角色高度至少降了 1.4 m（playerState 的 y 是角色中心）
    assert.ok(before.y - after.y > 1.4, `高度 ${before.y.toFixed(2)} → ${after.y.toFixed(2)}，應該下到水裡`);
    assert.equal(after.respawnCount, 0);
  });

  await check('走進深水：回到安全點，仍在澄鏡湖', async () => {
    const before = await state();
    await teleport(O.x - 40, O.z + 40, 1500);
    const s = await state();
    assert.equal(s.respawnCount, before.respawnCount + 1);
    assert.ok(inLake(s), `重生在 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
  });

  await check('月弧木橋：從北岸走過橋到倒影蘆葦島，沒有落水', async () => {
    const before = await state();
    await teleport(O.x - 2, O.z - 53, 1200);
    await runToward(page, debug, O.x - 2, O.z - 10, 5000);
    const s = await state();
    assert.ok(s.z - O.z > -27, `停在 z = ${(s.z - O.z).toFixed(1)}`);
    assert.equal(s.respawnCount, before.respawnCount);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'reed_isle');
  });

  await check('水鏡神殿：區域與濃霧', async () => {
    await teleport(O.x + 46, O.z + 26, 1200);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'mirror_temple');
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).target > 0.9);
  });

  await check('在澄鏡湖存檔（目前版本），迷霧有澄鏡湖的區域', async () => {
    await teleport(O.x - 112, O.z + 14, 900);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    assert.ok(Math.abs(data.player.position.x - (O.x - 112)) < 1);
    assert.equal(data.mist.mirror_temple, 'dense');
  });
});

await runE2e('mirrorlake e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, state, interactTarget }) => {
  await check('繼續遊戲：在澄鏡湖醒來', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(1500);
    const s = await state();
    assert.ok(inLake(s), `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
    assert.deepEqual(await debug(() => window.__mistwoodDebug.currentMap()), { at: 'mirrorlake', shown: 'mirrorlake' });
  });

  await check('從林間水道出口回到螢苔祕林（古樹祭壇東南的出口，任務 12B）', async () => {
    await faceGate(lakeGate, { page, debug });
    assert.equal(await interactTarget(), 'mirrorlake_gate_glowmoss');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'glowmoss', null, { timeout: 3000 });
    await page.waitForTimeout(1200);
    const s = await state();
    // 抵達點在出口前方 4 m（出口面向的方向）
    const yaw = forestGate.rotation[1];
    const ax = forestGate.position[0] + Math.sin(yaw) * 4;
    const az = forestGate.position[2] + Math.cos(yaw) * 4;
    assert.ok(Math.hypot(s.x - ax, s.z - az) < 0.8, `抵達點 (${ax.toFixed(1)}, ${az.toFixed(1)})，實際 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
  });
});
