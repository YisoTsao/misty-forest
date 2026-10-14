// 端對端：任務 8B — 螢苔祕林的三種怪物（Bible §6.6）。
// 霧孢飛蛾在螢苔林地生成、先繞著玩家盤旋再出手；根鬚甲蟲被打會縮殼（減傷），衝撞後的破綻會受到較多傷害；
// 迷霧芽怪會吐泥團，打中時扣血並讓玩家變慢。外觀以截圖檢查（--forestmobs）。
// 用法：pnpm build && node e2e/forestmobs.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const enemies = JSON.parse(readFileSync('src/data/enemies.json', 'utf8'));
const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const def = (id) => enemies.find((e) => e.id === id);
const sp = (id) => spawners.find((s) => s.id === id);

await runE2e('forestmobs e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, state, teleport }) => {
  const list = () => debug(() => window.__mistwoodDebug.enemies());
  const waitFor = (kind, timeout = 25_000) =>
    page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k && e.anim), kind, { timeout });
  const goTo = async (spawnerId, kind, offset = 6) => {
    const s = sp(spawnerId);
    await teleport(s.center[0], s.center[1] + s.radius + offset, 300);
    await waitFor(kind);
    // 同種怪物晨曦谷地也有（迷霧芽怪）：取離這個生成點最近的
    const near = (await list()).filter((e) => e.kind === kind).sort((a, b) => Math.hypot(a.x - s.center[0], a.z - s.center[1]) - Math.hypot(b.x - s.center[0], b.z - s.center[1]));
    return near[0];
  };
  const setPeaceful = (p) => debug((v) => window.__mistwoodDebug.setPeaceful(v), p);
  /** 玩家站在 (x, z) 不動，等到某隻敵人的狀態符合 */
  const waitState = (id, states, timeout) =>
    page.waitForFunction(([eid, ss]) => ss.includes(window.__mistwoodDebug.enemies().find((e) => e.id === eid)?.state), [id, states], { timeout });

  await check('三種森林怪物都會在螢苔祕林生成', async () => {
    for (const [spawner, kind] of [
      ['glade_moths', 'mob_fog_moth'],
      ['maze_beetles', 'mob_root_beetle'],
      ['glade_sprouts', 'mob_mist_sprout'],
    ]) {
      const e = await goTo(spawner, kind);
      assert.ok(e && e.x > 1800, `${kind} 沒有在螢苔祕林生成`);
    }
  });

  await check('霧孢飛蛾：靠近後先繞著玩家盤旋，再俯衝出手（前搖時翅膀閃爍）', async () => {
    const moth = await goTo('glade_moths', 'mob_fog_moth');
    await teleport(moth.x + 4, moth.z, 300);
    await setPeaceful(false);
    await waitState(moth.id, ['orbit'], 8000);
    const orbiting = (await list()).find((e) => e.id === moth.id);
    assert.equal(orbiting.anim, 'orbit');
    await page.waitForFunction((id) => window.__mistwoodDebug.enemies().find((e) => e.id === id)?.anim === 'windup', moth.id, { timeout: 10_000 });
    await setPeaceful(true);
  });

  await check('根鬚甲蟲：被打到時縮殼，縮殼時受到的傷害較少', async () => {
    const b = def('mob_root_beetle');
    const beetle = await goTo('maze_beetles', 'mob_root_beetle', 4);
    await debug(([id]) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), [beetle.id]);
    // 縮殼的表現在下一幀更新：等到動作也換成縮殼
    await page.waitForFunction((id) => window.__mistwoodDebug.enemies().find((e) => e.id === id)?.anim === 'guard', beetle.id, { timeout: 2000 });
    const afterFirst = (await list()).find((e) => e.id === beetle.id);
    const first = b.maxHp - afterFirst.hp;
    await debug(([id]) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), [beetle.id]);
    await page.waitForTimeout(150);
    const second = afterFirst.hp - (await list()).find((e) => e.id === beetle.id).hp;
    assert.ok(second > 0 && second < first * 0.5, `第一下 ${first}、縮殼時 ${second}`);
  });

  await check('根鬚甲蟲：衝撞之後的破綻受到較多傷害', async () => {
    await setPeaceful(false);
    const beetle = await goTo('maze_beetles', 'mob_root_beetle', 4);
    await teleport(beetle.x, beetle.z + 1.6, 200);
    await waitState(beetle.id, ['recover'], 12_000);
    const before = (await list()).find((e) => e.id === beetle.id).hp;
    await debug(([id]) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), [beetle.id]);
    await page.waitForTimeout(150);
    const dealt = before - ((await list()).find((e) => e.id === beetle.id)?.hp ?? 0);
    const base = JSON.parse(readFileSync('src/data/weapons.json', 'utf8'))
      .flatMap((w) => [...w.light, w.heavy])
      .find((m) => m.id === 'sword_slash_diag').damage;
    assert.ok(dealt > base, `破綻時 ${dealt}（一般 ${base}）`);
    await setPeaceful(true);
    // 回滿血（被甲蟲撞到的部分）
    await debug(() => window.__mistwoodDebug.send({ type: 'Rest' }));
  });

  await check('迷霧芽怪：在中距離吐泥團，打中後扣血並讓玩家變慢', async () => {
    const sprout = await goTo('glade_sprouts', 'mob_mist_sprout');
    await teleport(sprout.x + 5.5, sprout.z, 300);
    await setPeaceful(false);
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining > 0, null, { timeout: 15_000 });
    const slow = await debug(() => window.__mistwoodDebug.playerSlow());
    assert.ok(slow.scale < 1);
    await setPeaceful(true);
    // 變慢時走的距離比平常短
    const a = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const b = await state();
    const slowDist = Math.hypot(b.x - a.x, b.z - a.z);
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining <= 0, null, { timeout: 5000 });
    const c = await state();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const d = await state();
    const normalDist = Math.hypot(d.x - c.x, d.z - c.z);
    assert.ok(slowDist < normalDist * 0.8, `變慢 ${slowDist.toFixed(2)} m、平常 ${normalDist.toFixed(2)} m`);
  });
});
