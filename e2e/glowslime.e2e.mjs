// 端對端：任務 12D — 螢苔史萊姆（規格 M-01）。
// A 迷霧入口與 B 螢苔花園會生成螢苔史萊姆；打破後分裂成兩隻小史萊姆，小的不再分裂，原地附近生成。外觀以截圖檢查（--monsters --enemies=mob_moss_slime）。
// 用法：pnpm build && node e2e/glowslime.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const sp = (id) => spawners.find((s) => s.id === id);

await runE2e('glowslime e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
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
  const hit = (id, attack = 'sword_slash_diag') => debug(([eid, a]) => window.__mistwoodDebug.hitEnemy(eid, a), [id, attack]);

  await check('螢苔史萊姆在 A 迷霧入口與 B 螢苔花園生成', async () => {
    for (const spawner of ['glowmoss_slimes_a', 'glowmoss_slimes_b']) {
      const e = await goTo(spawner, 'mob_moss_slime');
      assert.ok(e && e.x > 1800 && e.x < 2000, `${spawner} 沒有生成螢苔史萊姆`);
    }
  });

  await check('螢苔史萊姆被打破時分裂成兩隻小史萊姆，在原地附近', async () => {
    const slime = await goTo('glowmoss_slimes_b', 'mob_moss_slime', 4);
    for (let i = 0; i < 8 && (await find(slime.id)); i++) {
      await hit(slime.id);
      await page.waitForTimeout(200);
    }
    assert.equal(await find(slime.id), undefined, '螢苔史萊姆沒有被打破');
    await page.waitForTimeout(300);
    const drops = (await list()).filter((e) => e.id.startsWith(`${slime.id}~`));
    assert.equal(drops.length, 2);
    for (const d of drops) {
      assert.equal(d.kind, 'mob_moss_slime_small');
      assert.ok(Math.hypot(d.x - slime.x, d.z - slime.z) < 6, `小史萊姆離母體 ${Math.hypot(d.x - slime.x, d.z - slime.z).toFixed(1)} m`);
    }
    for (const d of drops) for (let i = 0; i < 4 && (await find(d.id)); i++) await hit(d.id);
    await page.waitForTimeout(300);
    assert.equal((await list()).filter((e) => e.id.startsWith(`${slime.id}~`)).length, 0);
  });
});
