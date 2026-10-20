// 端對端：任務 8A、12B — 螢苔祕林（第二章，Bible §6）與地圖切換。
// 晨曦谷地溪東荒野的林道入口：木橋修好前說明原因、不能通過；修好後黑幕轉場到螢苔祕林的迷霧入口，
// 站在新地圖的地面上、顯示地圖與區域名稱、小地圖換成新地圖、穿過石拱門走進螢苔花園、讀破損的路牌、打開第一個寶箱、
// 邊界擋得住、掉落回到新地圖、花園可採集螢苔、存檔重開後仍在螢苔祕林，從入口回到晨曦谷地。外觀以截圖檢查（glowmoss_* 書籤）。
// 用法：pnpm build && node e2e/glowmoss.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, prefabs, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const ORIGIN = { x: 2000, z: 0 };
const dawnGate = placements.find((p) => p.id === 'dawn_gate_glowmoss');
const forestGate = placements.find((p) => p.id === 'glowmoss_gate_dawnvale');
const tuft = placements.find((p) => p.prefabId === 'glowmoss_tuft' && p.regionId === 'glow_garden');
const sign = placements.find((p) => p.id === 'glowmoss_signpost_broken');
const chest = placements.find((p) => p.id === 'glowmoss_first_chest');
const arch = placements.find((p) => p.id === 'glowmoss_mist_arch');
const inGlowmoss = (s) => Math.abs(s.x - ORIGIN.x) < 170 && Math.abs(s.z - ORIGIN.z) < 170;

await runE2e('glowmoss e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, state, teleport, interactTarget, itemCount, objectState }) => {
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

  await check('木橋修好、燈塔點亮之前：說明原因、不能通過', async () => {
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /木橋/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(900);
    assert.equal((await currentMap()).at, 'dawnvale');
  });

  await check('修好木橋、點亮燈塔後：黑幕轉場到螢苔祕林的迷霧入口，站在地面上、面向林子', async () => {
    await debug(() => window.__mistwoodDebug.setQuestCompleted('repair_bridge'));
    await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));
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
    assert.match(await banner.innerText(), /螢苔祕林[\s\S]*迷霧入口/);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'mist_gate');
    assert.match(await page.locator('[data-testid="minimap-region"]').innerText(), /迷霧入口/);
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

  await check('迷霧入口是濃霧；讀得到破損的路牌', async () => {
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).target > 0.9);
    await teleport(sign.position[0] - 1.6, sign.position[2] - 0.6, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [sign.position[0], sign.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, sign.id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /螢苔花園[\s\S]*發光/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('打開石拱門旁的第一個寶箱', async () => {
    const yaw = chest.rotation[1];
    await teleport(chest.position[0] + Math.sin(yaw) * 1.4, chest.position[2] + Math.cos(yaw) * 1.4, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [chest.position[0], chest.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, chest.id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    assert.equal((await objectState(chest.id))?.open, true);
    assert.ok((await itemCount('starlight_shard')) >= 1);
    // 序章的紙條只在放出星光夥伴的寶箱出現（任務 12B 修正）
    assert.equal(await page.locator('[data-testid="message-dialog"]').count(), 0);
  });

  await check('穿過石拱門走進螢苔花園：拱門中間走得過去，花園是淡霧', async () => {
    await teleport(arch.position[0] - 7, arch.position[2], 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [arch.position[0] + 20, arch.position[2]]);
    await page.waitForTimeout(300);
    const before = await state();
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    const after = await state();
    assert.ok(after.x > arch.position[0] + 6, `只走到 x = ${after.x.toFixed(1)}（拱門在 ${arch.position[0]}，起點 ${before.x.toFixed(1)}）`);
    await teleport(ORIGIN.x - 56, ORIGIN.z + 6, 1200);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'glow_garden');
    const mist = (await debug(() => window.__mistwoodDebug.mist())).target;
    assert.ok(mist > 0.3 && mist < 0.7, `花園迷霧 ${mist}`);
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

  await check('螢苔花園可以採集螢苔', async () => {
    const yaw = 0;
    await teleport(tuft.position[0], tuft.position[2] + 1.1, 900);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [tuft.position[0], tuft.position[2]]);
    await page.waitForTimeout(400);
    assert.equal(await interactTarget(), tuft.id, `互動目標 ${await interactTarget()}（yaw ${yaw}）`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1500);
    assert.ok((await itemCount('glow_moss')) >= 1);
  });

  await check('在螢苔祕林存檔（目前版本），位置是新地圖的世界座標', async () => {
    await teleport(ORIGIN.x - 100, ORIGIN.z + 2, 900);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    assert.ok(Math.abs(data.player.position.x - (ORIGIN.x - 100)) < 1);
    assert.equal(typeof data.mist.glow_garden, 'string');
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

  await check('從迷霧入口的林道入口回到晨曦谷地（溪東荒野的林道入口前）', async () => {
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
