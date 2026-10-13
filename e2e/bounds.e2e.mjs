// 端對端：任務 6A — 地圖邊界（GAME_DESIGN 5.1）：四邊與角落都走不出去（跑、跳也一樣），不會掉出地圖重生；
// 靠近邊界時出現「迷霧太濃」提示，離開後消失；攝影機不被邊界牆拉近。迷霧牆外觀以截圖檢查（--bounds）。
// 用法：pnpm build && node e2e/bounds.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, prefabs, runE2e } from './lib.mjs';

const HALF = 74;
const CORNER = 10;
/** 與 game-core/world/bounds.ts 相同的圓角方形距離（界內為正） */
function boundaryDistance(x, z) {
  const inner = HALF - CORNER;
  const qx = Math.abs(x) - inner;
  const qz = Math.abs(z) - inner;
  return -(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - CORNER);
}

// 有碰撞的物件（樹、岩石、房屋…）會在跑到邊界前擋住角色，所以挑一條沒有障礙物的直線
const blockers = placements
  .filter((p) => prefabs.get(p.prefabId)?.collision && Math.abs(p.position[0]) < 200)
  .map((p) => ({ x: p.position[0], z: p.position[2] }));
function laneClear(sx, sz, dx, dz, length) {
  for (const b of blockers) {
    const t = (b.x - sx) * dx + (b.z - sz) * dz;
    if (t < -1 || t > length + 1) continue;
    const off = Math.abs((b.x - sx) * dz - (b.z - sz) * dx);
    if (off < 1.9) return false;
  }
  return true;
}
/** 從邊界往內 START 公尺處出發，沿 (dx, dz) 走到邊界；沿著邊界方向挪動直到找到暢通的路線 */
const START = 16;
function findLane(dx, dz, along) {
  // 從原點沿 (dx, dz) 到邊界的距離
  let edge = 0;
  while (boundaryDistance(dx * edge, dz * edge) > 0) edge += 0.05;
  for (let i = 0; i < 40; i++) {
    const shift = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 2;
    const sx = dx * (edge - START) + along[0] * shift;
    const sz = dz * (edge - START) + along[1] * shift;
    if (laneClear(sx, sz, dx, dz, START + 2)) return { sx, sz };
  }
  throw new Error(`找不到暢通路線：${dx},${dz}`);
}

const diag = Math.SQRT1_2;
const lanes = [
  { name: '東', dir: [1, 0], along: [0, 1] },
  { name: '西', dir: [-1, 0], along: [0, 1] },
  { name: '南', dir: [0, 1], along: [1, 0] },
  { name: '北', dir: [0, -1], along: [1, 0] },
  { name: '東北角', dir: [diag, -diag], along: [diag, diag] },
].map((l) => ({ ...l, ...findLane(l.dir[0], l.dir[1], l.along) }));

await runE2e('bounds e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, state, camera, teleport }) => {
  const boundary = () => debug(() => window.__mistwoodDebug.boundary());
  const toasts = page.locator('[data-testid="toast"]');

  await check('邊界碰撞已建立', async () => {
    const b = await boundary();
    assert.ok(b.colliders > 40, `colliders=${b.colliders}`);
    assert.ok(b.distance > 20, `出生點離邊界 ${b.distance}`);
    assert.equal(b.near, false);
  });

  let firstLane = true;
  for (const lane of lanes) {
    await check(`往${lane.name}一路跑、跳：停在邊界內，沒有掉出地圖`, async () => {
      const before = await state();
      await teleport(lane.sx, lane.sz);
      // 攝影機朝前進方向：前進方向 = (−sin yaw, −cos yaw)
      await camera({ yaw: Math.atan2(-lane.dir[0], -lane.dir[1]), pitch: 0.35, distance: 6 });
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(450);
        if (i >= 5) await page.keyboard.press('Space');
      }
      await page.waitForTimeout(700);
      const s = await state();
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      const d = boundaryDistance(s.x, s.z);
      assert.equal(s.respawnCount, before.respawnCount, '角色掉出地圖被重生');
      assert.ok(d > -0.05, `走出邊界：(${s.x.toFixed(2)}, ${s.z.toFixed(2)}) 距離 ${d.toFixed(2)}`);
      assert.ok(d < 1.5, `沒有走到邊界（被擋住？）：距離 ${d.toFixed(2)}`);
      const b = await boundary();
      assert.equal(b.near, true);
      if (firstLane) {
        firstLane = false;
        assert.ok(b.warnings >= 1, `warnings=${b.warnings}`);
        await assertToast(toasts, /迷霧太濃/);
      }
    });
  }

  await check('貼著邊界、攝影機在牆外：不會被邊界牆拉近', async () => {
    const lane = lanes[0];
    await teleport(lane.sx + lane.dir[0] * (START - 1), lane.sz + lane.dir[1] * (START - 1));
    const s = await state();
    // 攝影機在角色後方 (sin yaw, cos yaw)；讓它落在牆外
    const yaw = Math.atan2(lane.dir[0], lane.dir[1]);
    // 仰角高一點，避免攝影機被牆外抬升的地形擋住（地形本來就會拉近攝影機）
    await camera({ yaw, pitch: 0.6, distance: 8 });
    await page.waitForTimeout(900);
    const cam = await camera();
    const horizontal = Math.hypot(cam.x - s.x, cam.z - s.z);
    assert.ok(horizontal > 8 * Math.cos(0.6) * 0.85, `攝影機被拉近到 ${horizontal.toFixed(2)} m`);
    assert.ok(boundaryDistance(cam.x, cam.z) < 0, '攝影機應在牆外');
  });

  await check('往回走：離開提示範圍', async () => {
    const lane = lanes[0];
    await camera({ yaw: Math.atan2(lane.dir[0], lane.dir[1]), pitch: 0.35, distance: 6 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2600);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const b = await boundary();
    assert.equal(b.near, false, `distance=${b.distance}`);
    assert.ok(b.distance > 4);
  });
});

async function assertToast(toasts, pattern) {
  await toasts.first().waitFor({ timeout: 3000 });
  const texts = await toasts.allInnerTexts();
  assert.ok(
    texts.some((t) => pattern.test(t)),
    `toasts: ${JSON.stringify(texts)}`,
  );
}
