// 端對端：任務 4A — 建造（規格 6.7、Phase 4 驗收）：只能在湖心小島建造、選單、預覽可 / 不可放置、
// 材料不足不可建、確認後才扣材料、旋轉、無效位置不可放、建造物有碰撞、Esc 離開、重啟後仍在。
// 用法：pnpm build && node e2e/build.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { runE2e, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const ISLAND = { x: 37.5, z: 8 };

await runE2e('build e2e（1/2）', { env }, async ({ page, check, debug, state, camera, teleport, itemCount }) => {
  const buildState = () => debug(() => window.__mistwoodDebug.buildState());
  const buildings = () => debug(() => window.__mistwoodDebug.buildings());
  const give = (items) => debug((it) => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: it }), items);
  const problem = () => page.locator('[data-testid="build-problem"]');
  /** 站在 (x, z) 面向 (tx, tz) */
  const standFacing = async (x, z, tx, tz) => {
    await teleport(x, z, 500);
    await debug(([a, b]) => window.__mistwoodDebug.face(a, b), [tx, tz]);
    await page.waitForTimeout(200);
  };

  await check('小島以外按 B：提示只能在湖心小島建造', async () => {
    await page.keyboard.press('KeyB');
    await page.waitForTimeout(300);
    assert.equal((await buildState()).mode, null);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'build.onlyHome'));
  });

  await check('小島上按 B 開啟建造選單，按 1 選營火後顯示預覽', async () => {
    await standFacing(ISLAND.x - 2, ISLAND.z, ISLAND.x + 2, ISLAND.z);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'home');
    await page.keyboard.press('KeyB');
    await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 2000 });
    await page.keyboard.press('Digit1');
    await page.locator('[data-testid="build-status"]').waitFor({ timeout: 2000 });
    assert.equal((await buildState()).mode.selected, 'campfire');
  });

  await check('材料不足：顯示「材料不足」，按 E 不會建造', async () => {
    await page.waitForTimeout(300);
    assert.equal(await problem().innerText(), '材料不足');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    assert.equal((await buildings()).length, 0);
  });

  await check('材料足夠：可以放置，按 E 建造並扣除材料（確認後才扣）', async () => {
    await give([{ itemId: 'wood', count: 10 }, { itemId: 'stone', count: 5 }]);
    await page.waitForTimeout(300);
    assert.equal(await problem().innerText(), '可以放置');
    assert.equal(await itemCount('wood'), 10, '還沒確認就扣了材料');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    const list = await buildings();
    assert.equal(list.length, 1);
    assert.equal(list[0].buildable, 'campfire');
    assert.equal(await itemCount('wood'), 6);
    assert.equal(await itemCount('stone'), 2);
  });

  await check('預覽與已放置的營火重疊：顯示被擋住，不能放', async () => {
    await page.waitForTimeout(300);
    assert.equal(await problem().innerText(), '被其他東西擋住了');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    assert.equal((await buildings()).length, 1);
  });

  await check('換成木凳、按 R 旋轉 45°，放在別處', async () => {
    await page.keyboard.press('KeyB');
    await page.locator('[data-testid="build-menu"]').waitFor({ timeout: 2000 });
    await page.locator('[data-testid="build-option-stool"]').click();
    await standFacing(ISLAND.x, ISLAND.z - 2.5, ISLAND.x, ISLAND.z - 4.5);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(300);
    assert.ok(Math.abs((await buildState()).ghost.yaw - Math.PI / 4) < 1e-6);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    const stool = (await buildings()).find((b) => b.buildable === 'stool');
    assert.ok(stool, '沒有放下木凳');
    assert.ok(Math.abs(stool.yaw - Math.PI / 4) < 1e-6);
  });

  await check('面向湖面：預覽在小島外，不能放', async () => {
    await standFacing(ISLAND.x - 3.6, ISLAND.z, ISLAND.x - 10, ISLAND.z);
    await page.waitForTimeout(300);
    assert.match(await problem().innerText(), /超出小島的範圍|不能蓋在水裡/);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(300);
    assert.equal((await buildings()).length, 2);
  });

  await check('Esc 離開建造模式（不開暫停選單）', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal((await buildState()).mode, null);
    assert.equal(await page.locator('[data-testid="pause-menu"]').count(), 0);
  });

  await check('建造物有碰撞：走向營火會被擋住', async () => {
    const fire = (await buildings()).find((b) => b.buildable === 'campfire');
    await teleport(fire.x, fire.z + 2.5, 600);
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await page.keyboard.down('KeyW');
    let min = Infinity;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(80);
      const s = await state();
      min = Math.min(min, Math.hypot(s.x - fire.x, s.z - fire.z));
    }
    await page.keyboard.up('KeyW');
    assert.ok(min > 0.6, `穿進營火：最近 ${min.toFixed(2)}`);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
  });
});

await runE2e('build e2e（2/2 重開）', { query: 'debug=1', env }, async ({ page, check, debug }) => {
  await check('重啟後建造物仍在（類型、位置、旋轉）', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    const list = await debug(() => window.__mistwoodDebug.buildings());
    assert.deepEqual(list.map((b) => b.buildable).sort(), ['campfire', 'stool']);
    assert.ok(Math.abs(list.find((b) => b.buildable === 'stool').yaw - Math.PI / 4) < 1e-6);
  });

  await check('拆除後退還材料', async () => {
    const before = await debug(() => window.__mistwoodDebug.itemCount('wood'));
    await debug(() => window.__mistwoodDebug.send({ type: 'RemoveBuilding', buildingId: window.__mistwoodDebug.buildings()[0].id }));
    assert.equal((await debug(() => window.__mistwoodDebug.buildings())).length, 1);
    assert.ok((await debug(() => window.__mistwoodDebug.itemCount('wood'))) > before);
  });
});
