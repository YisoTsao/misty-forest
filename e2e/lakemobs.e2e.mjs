// 端對端：任務 9B — 澄鏡湖的三種怪物（Bible §7.6）。
// 水泡精在湖岸生成，被打破時分裂成兩個小水滴；霧鷺影在遠處擲霧羽（打中變慢），擲完向後瞬移；
// 鏡殼蟹從正面打幾乎不痛，從側面打才有效。外觀以截圖檢查（--monsters --enemies=mob_bubble_wisp,...）。
// 用法：pnpm build && node e2e/lakemobs.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const sp = (id) => spawners.find((s) => s.id === id);

await runE2e('lakemobs e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
  const list = () => debug(() => window.__mistwoodDebug.enemies());
  const find = async (id) => (await list()).find((e) => e.id === id);
  const waitFor = (kind, timeout = 25_000) => page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k && e.anim), kind, { timeout });
  const goTo = async (spawnerId, kind, offset = 6) => {
    const s = sp(spawnerId);
    await teleport(s.center[0], s.center[1] + s.radius + offset, 300);
    await waitFor(kind);
    const near = (await list()).filter((e) => e.kind === kind).sort((a, b) => Math.hypot(a.x - s.center[0], a.z - s.center[1]) - Math.hypot(b.x - s.center[0], b.z - s.center[1]));
    return near[0];
  };
  const setPeaceful = (p) => debug((v) => window.__mistwoodDebug.setPeaceful(v), p);
  const hit = (id, attack = 'sword_slash_diag') => debug(([eid, a]) => window.__mistwoodDebug.hitEnemy(eid, a), [id, attack]);

  await check('三種湖區怪物都會在澄鏡湖生成', async () => {
    for (const [spawner, kind] of [
      ['lake_wisps_north', 'mob_bubble_wisp'],
      ['lake_herons_south', 'mob_mist_heron'],
      ['lake_crabs_ruins', 'mob_mirror_crab'],
    ]) {
      const e = await goTo(spawner, kind);
      assert.ok(e && e.x > 3800, `${kind} 沒有在澄鏡湖生成`);
    }
  });

  await check('水泡精：被打破時分裂成兩個小水滴，在原地附近', async () => {
    const wisp = await goTo('lake_wisps_north', 'mob_bubble_wisp', 4);
    for (let i = 0; i < 8 && (await find(wisp.id)); i++) {
      await hit(wisp.id);
      await page.waitForTimeout(200);
    }
    assert.equal(await find(wisp.id), undefined, '水泡精沒有被打破');
    await page.waitForTimeout(300);
    const drops = (await list()).filter((e) => e.id.startsWith(`${wisp.id}~`));
    assert.equal(drops.length, 2);
    for (const d of drops) {
      assert.equal(d.kind, 'mob_bubble_wisp_small');
      assert.ok(Math.hypot(d.x - wisp.x, d.z - wisp.z) < 6, `小水滴離母體 ${Math.hypot(d.x - wisp.x, d.z - wisp.z).toFixed(1)} m`);
    }
    for (const d of drops) for (let i = 0; i < 4 && (await find(d.id)); i++) await hit(d.id);
    await page.waitForTimeout(300);
    assert.equal((await list()).filter((e) => e.id.startsWith(`${wisp.id}~`)).length, 0);
  });

  await check('霧鷺影：遠距離擲霧羽（打中變慢），擲完向後瞬移拉開距離', async () => {
    const heron = await goTo('lake_herons_south', 'mob_mist_heron', 6);
    await teleport(heron.x + 7, heron.z, 300);
    await setPeaceful(false);
    await page.waitForFunction((id) => window.__mistwoodDebug.enemies().find((e) => e.id === id)?.anim === 'spit', heron.id, { timeout: 12_000 });
    const before = await find(heron.id);
    const p0 = await debug(() => window.__mistwoodDebug.playerState());
    const d0 = Math.hypot(before.x - p0.x, before.z - p0.z);
    await page.waitForFunction((id) => window.__mistwoodDebug.enemies().find((e) => e.id === id)?.anim !== 'spit', heron.id, { timeout: 4000 });
    const after = await find(heron.id);
    const p1 = await debug(() => window.__mistwoodDebug.playerState());
    const d1 = Math.hypot(after.x - p1.x, after.z - p1.z);
    assert.ok(d1 - d0 > 2.5, `擲羽前 ${d0.toFixed(1)} m、之後 ${d1.toFixed(1)} m`);
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining > 0, null, { timeout: 15_000 });
    await setPeaceful(true);
    await debug(() => window.__mistwoodDebug.send({ type: 'Rest' }));
  });

  await check('鏡殼蟹：從正面打幾乎不痛，從側面打才有效', async () => {
    const crab = await goTo('lake_crabs_ruins', 'mob_mirror_crab', 5);
    const c = await find(crab.id);
    // 站在蟹的正前方 1.6 m
    await teleport(c.x + Math.sin(c.yaw) * 1.6, c.z + Math.cos(c.yaw) * 1.6, 150);
    const c1 = await find(crab.id);
    const front = { x: c1.x + Math.sin(c1.yaw) * 1.6, z: c1.z + Math.cos(c1.yaw) * 1.6 };
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [front.x, front.z]);
    await page.waitForTimeout(60);
    const hp0 = (await find(crab.id)).hp;
    await hit(crab.id);
    await page.waitForTimeout(200);
    const c2 = await find(crab.id);
    const frontDealt = hp0 - c2.hp;
    // 站到蟹的側面
    const side = { x: c2.x + Math.cos(c2.yaw) * 1.6, z: c2.z - Math.sin(c2.yaw) * 1.6 };
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [side.x, side.z]);
    await page.waitForTimeout(60);
    await hit(crab.id);
    await page.waitForTimeout(200);
    const sideDealt = c2.hp - (await find(crab.id)).hp;
    assert.ok(frontDealt > 0 && frontDealt < sideDealt * 0.5, `正面 ${frontDealt}、側面 ${sideDealt}`);
  });
});
