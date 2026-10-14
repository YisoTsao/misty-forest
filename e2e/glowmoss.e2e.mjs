// 端對端：任務 8A — 螢苔祕林（Bible §6，地圖二）與地圖切換。
// 晨曦谷地溪東荒野的林道入口：木橋修好前說明原因、不能通過；修好後黑幕轉場到螢苔祕林的林緣小徑，
// 站在新地圖的地面上、顯示地圖與區域名稱、小地圖換成新地圖、邊界擋得住、掉落回到新地圖、
// 林中可採集螢苔、存檔重開後仍在螢苔祕林，從入口回到晨曦谷地。外觀以截圖檢查（glowmoss_* 書籤）。
// 用法：pnpm build && node e2e/glowmoss.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, prefabs, runE2e, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const ORIGIN = { x: 2000, z: 0 };
const dawnGate = placements.find((p) => p.id === 'dawn_gate_glowmoss');
const forestGate = placements.find((p) => p.id === 'glowmoss_gate_dawnvale');
const tuft = placements.find((p) => p.prefabId === 'glowmoss_tuft');
const inGlowmoss = (s) => Math.abs(s.x - ORIGIN.x) < 170 && Math.abs(s.z - ORIGIN.z) < 170;

await runE2e('glowmoss e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, state, teleport, interactTarget, itemCount }) => {
  const currentMap = () => debug(() => window.__mistwoodDebug.currentMap());
  /** 站在出入口前方 3 m、面向它 */
  const faceGate = async (gate) => {
    const yaw = gate.rotation[1];
    await teleport(gate.position[0] + Math.sin(yaw) * 1.8, gate.position[2] + Math.cos(yaw) * 1.8, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [gate.position[0], gate.position[2]]);
    await page.waitForTimeout(300);
  };

  await check('晨曦谷地溪東的林道入口顯示「前往 林道入口：螢苔祕林」', async () => {
    await faceGate(dawnGate);
    assert.equal(await interactTarget(), 'dawn_gate_glowmoss');
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /前往\s*林道入口：螢苔祕林/);
  });

  await check('木橋修好之前：說明原因、不能通過', async () => {
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /木橋/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(900);
    assert.equal((await currentMap()).at, 'dawnvale');
  });

  await check('修好木橋後：黑幕轉場到螢苔祕林的林緣小徑，站在地面上、面向林子', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('repair_bridge'));
    await faceGate(dawnGate);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'glowmoss', null, { timeout: 3000 });
    await page.waitForTimeout(1500);
    const s = await state();
    assert.ok(inGlowmoss(s), `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    const yaw = forestGate.rotation[1];
    const ax = forestGate.position[0] + Math.sin(yaw) * 4;
    const az = forestGate.position[2] + Math.cos(yaw) * 4;
    assert.ok(Math.hypot(s.x - ax, s.z - az) < 0.8, `抵達點 (${ax}, ${az})，實際 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded, '沒有站在地面上');
    assert.equal(s.respawnCount, 0);
    assert.deepEqual(await currentMap(), { at: 'glowmoss', shown: 'glowmoss' });
  });

  await check('顯示地圖名稱與區域名稱；小地圖換成螢苔祕林', async () => {
    const banner = page.locator('[data-testid="region-banner"]');
    await banner.waitFor({ timeout: 3000 });
    assert.match(await banner.innerText(), /螢苔祕林[\s\S]*林緣小徑/);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'moss_trail');
    assert.match(await page.locator('[data-testid="minimap-region"]').innerText(), /林緣小徑/);
    assert.ok((await debug(() => window.__mistwoodDebug.mapExplored('glowmoss'))) > 0);
  });

  await check('沿小徑往東走：地形有碰撞，走得動也不會掉下去', async () => {
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(after.x - before.x > 6, `只走了 ${(after.x - before.x).toFixed(1)} m`);
    assert.equal(after.respawnCount, 0);
    assert.ok(inGlowmoss(after));
  });

  await check('螢苔林地的迷霧與區域：苔冠空地是濃霧', async () => {
    await teleport(ORIGIN.x + 100, ORIGIN.z + 46, 1200);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'moss_crown');
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).target > 0.9);
  });

  await check('邊界：往北跑跳 4 秒仍在可玩區內', async () => {
    await teleport(ORIGIN.x - 20, ORIGIN.z - 138, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [ORIGIN.x - 20, ORIGIN.z - 300]);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(650);
    }
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    const b = await debug(() => window.__mistwoodDebug.boundary());
    assert.ok(b.distance > -0.5, `超出邊界 ${b.distance}`);
    assert.ok(b.colliders > 80, `邊界碰撞體 ${b.colliders}`);
    assert.equal((await state()).respawnCount, 0);
  });

  await check('掉出地圖時回到螢苔祕林的安全點，不會被拉回晨曦谷地', async () => {
    await teleport(ORIGIN.x - 60, ORIGIN.z + 2, 1500);
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z, -40), [ORIGIN.x - 60, ORIGIN.z + 2]);
    await page.waitForTimeout(800);
    const s = await state();
    assert.equal(s.respawnCount, 1);
    assert.ok(inGlowmoss(s), `重生在 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
  });

  await check('可以採集螢苔', async () => {
    const yaw = 0;
    await teleport(tuft.position[0], tuft.position[2] + 1.1, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [tuft.position[0], tuft.position[2]]);
    await page.waitForTimeout(400);
    assert.equal(await interactTarget(), tuft.id, `互動目標 ${await interactTarget()}（yaw ${yaw}）`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1500);
    assert.ok((await itemCount('glow_moss')) >= 1);
  });

  await check('在螢苔祕林存檔（v12），位置是新地圖的世界座標', async () => {
    await teleport(ORIGIN.x - 100, ORIGIN.z + 2, 900);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, 12);
    assert.ok(Math.abs(data.player.position.x - (ORIGIN.x - 100)) < 1);
    assert.equal(typeof data.mist.moss_glade, 'string');
  });
});

await runE2e('glowmoss e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug, state, interactTarget }) => {
  await check('繼續遊戲：在螢苔祕林醒來，顯示的是新地圖', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(1500);
    const s = await state();
    assert.ok(inGlowmoss(s), `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
    assert.deepEqual(await debug(() => window.__mistwoodDebug.currentMap()), { at: 'glowmoss', shown: 'glowmoss' });
  });

  await check('從林緣小徑的入口回到晨曦谷地（溪東荒野的林道入口前）', async () => {
    const yaw = forestGate.rotation[1];
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [forestGate.position[0] + Math.sin(yaw) * 1.8, forestGate.position[2] + Math.cos(yaw) * 1.8]);
    await page.waitForTimeout(800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [forestGate.position[0], forestGate.position[2]]);
    await page.waitForTimeout(300);
    assert.equal(await interactTarget(), 'glowmoss_gate_dawnvale');
    assert.ok(prefabs.get('gate_to_dawnvale'));
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.currentMap().at === 'dawnvale', null, { timeout: 3000 });
    await page.waitForTimeout(1200);
    const s = await state();
    assert.ok(Math.hypot(s.x - (dawnGate.position[0] - 4), s.z - dawnGate.position[2]) < 0.8, `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
    assert.equal((await debug(() => window.__mistwoodDebug.currentMap())).shown, 'dawnvale');
  });
});
