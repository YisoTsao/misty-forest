// 端對端：任務 9F — 風語草原（Bible §8，地圖四）。
// 澄鏡湖東岸的古風帆：倒影中的守護者完成前說明原因、不能通過；完成後轉場到風語草原西側的入口，
// 顯示地圖與區域名稱；開闊的草原走得動；風車聚落、風向塔台地（從緩坡走上去）的區域與迷霧；浮石山脊走不上去；
// 存檔重開後仍在風語草原，從入口回到澄鏡湖。外觀以截圖檢查（meadow_* 書籤）。
// 用法：pnpm build && node e2e/meadow.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const O = { x: 6000, z: 0 };
const lakeSail = placements.find((p) => p.id === 'mirrorlake_gate_meadow');
const meadowSail = placements.find((p) => p.id === 'meadow_gate_mirrorlake');
const inMeadow = (s) => Math.abs(s.x - O.x) < 170 && Math.abs(s.z - O.z) < 170;

async function faceGate(gate, { page, debug }) {
  const yaw = gate.rotation[1];
  await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [gate.position[0] + Math.sin(yaw) * 1.8, gate.position[2] + Math.cos(yaw) * 1.8]);
  await page.waitForTimeout(900);
  await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [gate.position[0], gate.position[2]]);
  await page.waitForTimeout(300);
}

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

await runE2e('meadow e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, state, teleport, interactTarget }) => {
  const currentMap = () => debug(() => window.__mistwoodDebug.currentMap());

  await check('澄鏡湖東岸的古風帆：守護者的事還沒解決前說明原因、不能通過', async () => {
    await faceGate(lakeSail, { page, debug });
    assert.equal(await interactTarget(), 'mirrorlake_gate_meadow');
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /前往\s*古風帆：風語草原/);
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /璃漪|神殿/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(900);
    assert.equal((await currentMap()).at, 'mirrorlake');
  });

  await check('完成「倒影中的守護者」後：轉場到風語草原的西側入口，站在地面上', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_lake_003'));
    await faceGate(lakeSail, { page, debug });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'whispermeadow', null, { timeout: 3000 });
    await page.waitForTimeout(1500);
    const s = await state();
    const yaw = meadowSail.rotation[1];
    const ax = meadowSail.position[0] + Math.sin(yaw) * 4;
    const az = meadowSail.position[2] + Math.cos(yaw) * 4;
    assert.ok(Math.hypot(s.x - ax, s.z - az) < 0.8, `抵達點 (${ax}, ${az})，實際 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
    assert.equal(s.respawnCount, 0);
    assert.deepEqual(await currentMap(), { at: 'whispermeadow', shown: 'whispermeadow' });
  });

  await check('顯示地圖名稱與區域名稱；小地圖換成風語草原', async () => {
    const banner = page.locator('[data-testid="region-banner"]');
    await banner.waitFor({ timeout: 3000 });
    assert.match(await banner.innerText(), /風語草原[\s\S]*起伏草原/);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'windy_hills');
    assert.match(await page.locator('[data-testid="minimap-region"]').innerText(), /起伏草原/);
  });

  await check('沿小徑往東跑：地形有碰撞，走得動也不會掉下去', async () => {
    const before = await state();
    await runToward(page, debug, O.x - 64, O.z + 30, 3000);
    const after = await state();
    assert.ok(after.x - before.x > 12, `只走了 ${(after.x - before.x).toFixed(1)} m`);
    assert.equal(after.respawnCount, 0);
  });

  await check('風車聚落：區域與淡霧', async () => {
    await teleport(O.x - 28, O.z + 52, 1200);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'windmill_hamlet');
  });

  await check('從西側緩坡走上風向塔台地；台地是濃霧', async () => {
    await teleport(O.x + 46, O.z + 31, 1000);
    const low = await state();
    await runToward(page, debug, O.x + 80, O.z + 18, 3200);
    const high = await state();
    assert.ok(high.y - low.y > 2.5, `高度 ${low.y.toFixed(1)} → ${high.y.toFixed(1)}`);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'wind_tower');
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).target > 0.9);
  });

  await check('浮石山脊的峭壁走不上去', async () => {
    await teleport(O.x - 20, O.z - 60, 1000);
    const low = await state();
    await runToward(page, debug, O.x - 20, O.z - 85, 2500);
    const after = await state();
    assert.ok(after.y - low.y < 4, `爬上了 ${(after.y - low.y).toFixed(1)} m`);
  });

  await check('在風語草原存檔（目前版本）', async () => {
    await teleport(O.x - 100, O.z + 12, 900);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    assert.equal(data.mist.golem_arena, 'dense');
  });
});

await runE2e('meadow e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, state, interactTarget }) => {
  await check('繼續遊戲：在風語草原醒來', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(1500);
    const s = await state();
    assert.ok(inMeadow(s), `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
  });

  await check('從西側的古風帆回到澄鏡湖東岸', async () => {
    await faceGate(meadowSail, { page, debug });
    assert.equal(await interactTarget(), 'meadow_gate_mirrorlake');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'mirrorlake', null, { timeout: 3000 });
    await page.waitForTimeout(1200);
    const s = await state();
    const yaw = lakeSail.rotation[1];
    assert.ok(Math.hypot(s.x - (lakeSail.position[0] + Math.sin(yaw) * 4), s.z - (lakeSail.position[2] + Math.cos(yaw) * 4)) < 0.8, `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
  });
});
