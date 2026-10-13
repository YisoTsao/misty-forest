// 端對端：在 Electron 正式版中驗證任務 1C — 環境碰撞、攝影機對樹避讓、寶箱互動、迷霧外觀切換。
// 用法：pnpm build && node e2e/world.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { _electron as electron } from 'playwright';

const prefabs = new Map(JSON.parse(readFileSync('src/data/prefabs.json', 'utf8')).map((p) => [p.id, p]));
const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
/** 膠囊半徑（characters.json traveler） */
const PLAYER_RADIUS = 0.32;
const PIVOT_OFFSET_Y = 0.55;

/** 找一棵四周 9 m 內（大於測試中攝影機距離 8 m）沒有其他碰撞體、遠離出生點與地圖邊緣的樹，避免測試受其他碰撞體干擾 */
function isolatedTree() {
  for (const p of placements) {
    const prefab = prefabs.get(p.prefabId);
    if (!p.prefabId.startsWith('tree_') || prefab.collision?.shape !== 'cylinder') continue;
    const [x, , z] = p.position;
    if (Math.abs(x) > 50 || Math.abs(z) > 50 || Math.hypot(x, z - 18) < 20) continue;
    const crowded = placements.some(
      (o) => o !== p && prefabs.get(o.prefabId).collider === 'static' && Math.hypot(o.position[0] - x, o.position[2] - z) < 9,
    );
    if (crowded) continue;
    const [sx, sy, sz] = p.scale ?? [1, 1, 1];
    return { id: p.id, x, z, radius: prefab.collision.radius * Math.max(sx, sz), height: prefab.collision.height * sy };
  }
  throw new Error('找不到合適的測試用樹木');
}

const chest = placements.find((p) => p.prefabId === 'chest_wood');
assert.ok(chest, 'placements 內沒有寶箱');

const app = await electron.launch({ args: ['.'], env: { ...process.env, MISTWOOD_START_QUERY: 'debug=1&play=1' } });
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
  page.on('pageerror', (err) => console.error(`[renderer] ${err.message}`));
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });
  await page.bringToFront();
  await page.locator('canvas').focus().catch(() => {});
  const debug = (fn, arg) => page.evaluate(fn, arg);
  const state = () => debug(() => window.__mistwoodDebug.playerState());
  const camera = (set) => debug((s) => window.__mistwoodDebug.camera(s), set);
  const teleport = async (x, z) => {
    await debug(([tx, tz]) => window.__mistwoodDebug.teleport(tx, tz), [x, z]);
    await page.waitForTimeout(700); // 落地、碰撞體更新
  };
  await page.waitForTimeout(800);

  const tree = isolatedTree();
  const totalColliders = placements.filter((p) => prefabs.get(p.prefabId).collider === 'static').length;

  await check('只啟用玩家附近的碰撞體，移動後會更新', async () => {
    const atSpawn = await debug(() => window.__mistwoodDebug.activeColliders());
    assert.ok(atSpawn > 0, '出生點附近沒有任何碰撞體');
    assert.ok(atSpawn < totalColliders / 2, `啟用了 ${atSpawn} / ${totalColliders} 個，沒有依距離篩選`);
    await teleport(tree.x, tree.z + 3.5);
    const nearTree = await debug(() => window.__mistwoodDebug.activeColliders());
    assert.ok(nearTree > 0 && nearTree < totalColliders / 2, `樹旁啟用 ${nearTree} 個`);
  });

  await check(`走向樹木（${tree.id}）會被擋住，不會穿過樹幹`, async () => {
    await teleport(tree.x, tree.z + 3.5);
    await camera({ yaw: 0, pitch: 0.35, distance: 6 }); // W = 往 -Z，正對樹幹
    await page.keyboard.down('KeyW');
    let minDist = Infinity;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(80);
      const s = await state();
      minDist = Math.min(minDist, Math.hypot(s.x - tree.x, s.z - tree.z));
    }
    await page.keyboard.up('KeyW');
    const contact = tree.radius + PLAYER_RADIUS;
    assert.ok(minDist > contact - 0.06, `穿進樹幹：最近距離 ${minDist.toFixed(3)}，接觸距離 ${contact.toFixed(3)}`);
    assert.ok(minDist < contact + 0.3, `沒有走到樹幹旁（最近 ${minDist.toFixed(2)}），測試前提不成立`);
  });

  await check('樹木擋在攝影機與角色之間時攝影機自動拉近', async () => {
    // 角色在樹的北側，攝影機在角色南側（+Z），中間隔著樹幹
    await teleport(tree.x, tree.z - 2.2);
    await camera({ yaw: 0, pitch: 0.15, distance: 8 });
    await page.waitForTimeout(800);
    const c = await camera();
    const p = await state();
    const dist = Math.hypot(c.x - p.x, c.y - (p.y + PIVOT_OFFSET_Y), c.z - p.z);
    assert.ok(dist < 2.2 - tree.radius, `攝影機距離 ${dist.toFixed(2)}，沒有被樹擋住而拉近`);
    // 換到沒有遮擋的方向後會退回設定距離
    await camera({ yaw: Math.PI, pitch: 0.15, distance: 8 });
    await page.waitForTimeout(1500);
    const c2 = await camera();
    const dist2 = Math.hypot(c2.x - p.x, c2.y - (p.y + PIVOT_OFFSET_Y), c2.z - p.z);
    assert.ok(dist2 > 7, `解除遮擋後沒有退回（${dist2.toFixed(2)}）`);
  });

  const prompt = page.locator('[data-testid="interact-prompt"]');
  const dialog = page.locator('[data-testid="message-dialog"]');
  const [cx, , cz] = chest.position;

  await check('遠離寶箱時沒有互動提示；靠近後顯示「打開 寶箱」', async () => {
    await debug(() => window.__mistwoodDebug.resetWorld());
    await teleport(cx + 0.5, cz + 4);
    await page.waitForTimeout(300);
    assert.equal(await prompt.count(), 0, '距離 4 m 仍顯示提示');
    await teleport(cx + 0.5, cz + 1.4);
    await prompt.waitFor({ timeout: 3000 });
    const text = await prompt.innerText();
    assert.match(text, /打開\s*寶箱/, `提示文字：${text}`);
    assert.equal(await debug(() => window.__mistwoodDebug.interactTarget()), chest.id);
  });

  await check('按 E 打開寶箱：播放互動動畫、伸手時蓋子狀態為開、星光碎片進背包、顯示訊息', async () => {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
    const s = await state();
    assert.equal(s.action, 'interact', `action=${s.action}`);
    // 指令在伸手的瞬間（0.45 秒）送出
    await page.waitForTimeout(500);
    const obj = await debug((id) => window.__mistwoodDebug.objectState(id), chest.id);
    assert.equal(obj?.open, true, `objectState=${JSON.stringify(obj)}`);
    assert.equal(await debug(() => window.__mistwoodDebug.itemCount('starlight_shard')), 1);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.itemId === 'starlight_shard'), `通知：${JSON.stringify(toasts)}`);
    await dialog.waitFor({ timeout: 3000 });
    assert.match(await dialog.innerText(), /打開了寶箱/);
  });

  await check('訊息視窗開啟時角色不會移動，E 可關閉', async () => {
    const before = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    const after = await state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.02, '視窗開啟時角色仍在移動');
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('已打開的寶箱不再顯示提示，也不能重複領取', async () => {
    await page.waitForTimeout(400);
    assert.equal(await prompt.count(), 0, '寶箱打開後仍顯示提示');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1500);
    assert.equal(await dialog.count(), 0, '重複開啟了訊息');
    assert.equal((await state()).action, null);
    assert.equal(await debug(() => window.__mistwoodDebug.itemCount('starlight_shard')), 1, '重複領取了獎勵');
  });

  await check('寶箱有碰撞，角色無法穿過', async () => {
    await teleport(cx, cz + 3);
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await page.keyboard.down('KeyW');
    let minDist = Infinity;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(80);
      const s = await state();
      minDist = Math.min(minDist, Math.hypot(s.x - cx, s.z - cz));
    }
    await page.keyboard.up('KeyW');
    // 方塊最小半寬（0.55 縮放後約 0.34）+ 膠囊半徑
    assert.ok(minDist > 0.34 + PLAYER_RADIUS - 0.06, `穿進寶箱：最近距離 ${minDist.toFixed(3)}`);
  });

  /** 畫面中央區域的平均飽和度（HSV S，0–1） */
  const saturation = () =>
    debug(() => {
      const src = document.querySelector('canvas');
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 90;
      const ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        sum += max === 0 ? 0 : (max - min) / max;
      }
      return sum / (data.length / 4);
    });

  await check('迷霧滑桿：uMist 平滑變化，迷霧時畫面明顯去飽和', async () => {
    await teleport(0, 18);
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await debug(() => window.__mistwoodDebug.setMist(0, true));
    await page.waitForTimeout(400);
    const clearSat = await saturation();
    await debug(() => window.__mistwoodDebug.setMist(1, false));
    await page.waitForTimeout(250);
    const mid = await debug(() => window.__mistwoodDebug.mist());
    assert.ok(mid.current > 0.05 && mid.current < 0.95, `沒有漸變：current=${mid.current.toFixed(3)}`);
    await page.waitForTimeout(2500);
    const end = await debug(() => window.__mistwoodDebug.mist());
    assert.ok(end.current > 0.98, `沒有到達目標：${end.current.toFixed(3)}`);
    const mistSat = await saturation();
    assert.ok(mistSat < clearSat * 0.6, `飽和度 晴朗 ${clearSat.toFixed(3)} → 迷霧 ${mistSat.toFixed(3)}`);
    await debug(() => window.__mistwoodDebug.setMist(0, true));
  });

  await check('除錯面板的迷霧滑桿可設定目標值', async () => {
    const slider = page.locator('[data-testid="mist-slider"]');
    await slider.fill('0.5');
    const m = await debug(() => window.__mistwoodDebug.mist());
    assert.equal(m.target, 0.5);
    await debug(() => window.__mistwoodDebug.setMist(0, true));
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await app.close();
}

console.log(`world e2e\n${results.join('\n')}`);
process.exit(failed ? 1 : 0);
