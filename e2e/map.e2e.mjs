// 端對端：任務 7B — 世界地圖與小地圖（Bible §31.3）。小地圖跟著玩家、走到新地方會揭開探索霧罩、
// M 開關世界地圖（開啟時角色不能移動、Esc 只關地圖）、暫停選單也能開地圖、任務標記、探索紀錄隨存檔保存。
// 地圖的外觀以截圖檢查（--map）。
// 用法：pnpm build && node e2e/map.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const balu = npcs.find((n) => n.id === 'balu');
const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');
const FARM = { x: -86, z: -28 };

await runE2e('map e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, state, teleport }) => {
  const minimap = page.locator('[data-testid="minimap"]');
  const worldMap = page.locator('[data-testid="world-map"]');
  const explored = () => debug(() => window.__mistwoodDebug.mapExplored());
  const isExplored = (x, z) => debug(([px, pz]) => window.__mistwoodDebug.isExplored(px, pz), [x, z]);

  await check('小地圖顯示在畫面右上角，中心是玩家的位置', async () => {
    await minimap.waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    const p = await state();
    const x = Number(await minimap.getAttribute('data-x'));
    const z = Number(await minimap.getAttribute('data-z'));
    assert.ok(Math.hypot(x - p.x, z - p.z) < 1, `小地圖中心 (${x}, ${z})，玩家 (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
    const box = await minimap.boundingBox();
    const view = page.viewportSize();
    assert.ok(box && box.y < 60 && box.x > (view?.width ?? 1200) / 2, JSON.stringify(box));
  });

  await check('新遊戲：出生點附近已探索，遠處仍是霧罩', async () => {
    assert.equal(await isExplored(0, 18), true);
    assert.equal(await isExplored(100, -100), false);
    assert.equal(await isExplored(FARM.x, FARM.z), false);
    const r = await explored();
    assert.ok(r > 0 && r < 0.1, `已探索 ${r}`);
  });

  await check('走到西坊農田：揭開附近的霧罩，小地圖下方顯示區域名稱', async () => {
    const before = await explored();
    await teleport(FARM.x, FARM.z, 1200);
    assert.equal(await isExplored(FARM.x, FARM.z), true);
    assert.ok((await explored()) > before);
    assert.match(await page.locator('[data-testid="minimap-region"]').innerText(), /西坊農田/);
  });

  await check('可以接的委託在委託人（波木）身上有「!」標記', async () => {
    const markers = await debug(() => window.__mistwoodDebug.questMarkers());
    const m = markers.find((k) => k.questId === 'wood_for_bridge');
    assert.ok(m, JSON.stringify(markers));
    assert.equal(m.kind, 'available');
    assert.ok(Math.hypot(m.x - balu.position[0], m.z - balu.position[1]) < 6, JSON.stringify(m));
  });

  await check('按 M 開啟世界地圖：顯示探索比例；開啟時角色不能移動、小地圖隱藏', async () => {
    await page.keyboard.press('KeyM');
    await worldMap.waitFor({ timeout: 2000 });
    assert.ok(Number(await worldMap.getAttribute('data-explored')) >= 1);
    assert.match(await page.locator('[data-testid="world-map-explored"]').innerText(), /已探索 \d+%/);
    assert.equal(await minimap.count(), 0);
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.05, '地圖開啟時角色移動了');
    // 地圖上的玩家位置
    assert.ok(Math.abs(Number(await worldMap.getAttribute('data-player-x')) - before.x) < 1);
  });

  await check('再按 M 關閉；Esc 也只關地圖、不會開啟暫停選單', async () => {
    await page.keyboard.press('KeyM');
    await worldMap.waitFor({ state: 'detached', timeout: 2000 });
    await page.keyboard.press('KeyM');
    await worldMap.waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await worldMap.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 0);
  });

  await check('暫停選單的「世界地圖」：開啟地圖，Esc 關閉後回到暫停選單', async () => {
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.locator('[data-testid="pause-map"]').click();
    await worldMap.waitFor({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await worldMap.waitFor({ state: 'detached', timeout: 2000 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 1);
    await page.locator('[data-testid="pause-resume"]').click();
    await page.waitForTimeout(300);
  });

  await check('探索紀錄寫入存檔（v11 map.explored）', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const data = JSON.parse(readFileSync(primary, 'utf8'));
    assert.equal(data.version, SAVE_VERSION);
    assert.equal(typeof data.map.explored, 'string');
    assert.ok(data.map.explored.length > 100);
  });
});

await runE2e('map e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug }) => {
  await check('繼續遊戲後探索過的農田仍是已探索，沒去過的地方仍是霧罩', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await debug(([x, z]) => window.__mistwoodDebug.isExplored(x, z), [FARM.x, FARM.z]), true);
    assert.equal(await debug(([x, z]) => window.__mistwoodDebug.isExplored(x, z), [0, 18]), true);
    assert.equal(await debug(() => window.__mistwoodDebug.isExplored(130, 130)), false);
  });
});
