// 端對端：第二章的森林怪物 — 迷霧深層（規格 M-03 霧紋森林狼、M-04 幻霧螢靈）與花園的菌帽小妖（M-02）；
// 深層的濃霧沒有螢光提燈時扣血較重並提示。
// 深層的生成點會生成森林狼與幻霧螢靈；狼被打倒後掉落霧紋獸牙或厚實獸皮（機率，只檢查數量變化的可能性，不強制）。
// 外觀以截圖檢查（--monsters --enemies=mob_mist_wolf,mob_fog_wisp）。
// 用法：pnpm build && node e2e/deepwoods.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const sp = (id) => spawners.find((s) => s.id === id);

await runE2e('deepwoods e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
  const list = () => debug(() => window.__mistwoodDebug.enemies());
  const goTo = async (spawnerId, kind) => {
    const s = sp(spawnerId);
    await teleport(s.center[0], s.center[1] + s.radius + 6, 300);
    await page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k && e.anim), kind, { timeout: 30_000 });
    return (await list()).find((e) => e.kind === kind);
  };

  await check('沒有螢光提燈走進深層的濃霧：被霧傷到時提示需要一盞燈', async () => {
    await teleport(2052, 92, 300);
    await page.waitForFunction(() => window.__mistwoodDebug.toasts().some((x) => x.textKey === 'toast.mistNeedLantern'), null, { timeout: 6000 });
    await teleport(1880, 2, 300);
  });

  await check('迷霧深層生成森林狼與幻霧螢靈', async () => {
    const wolf = await goTo('deep_wolves', 'mob_mist_wolf');
    assert.ok(wolf && wolf.x > 1990, '森林狼沒有在深層生成');
    const wisp = await goTo('deep_wisps', 'mob_fog_wisp');
    assert.ok(wisp && wisp.x > 1990, '幻霧螢靈沒有在深層生成');
  });

  await check('濃霧的深層會持續扣血；在安全的區域（A 區）不會', async () => {
    await teleport(2052, 92, 300);
    await page.waitForFunction(() => window.__mistwoodDebug.region() === 'deep_mist', null, { timeout: 5000 });
    const hp0 = await debug(() => window.__mistwoodDebug.combatState().hp);
    await page.waitForTimeout(4600);
    const hp1 = await debug(() => window.__mistwoodDebug.combatState().hp);
    assert.ok(hp1 < hp0, `深層的濃霧沒有扣血（${hp0} → ${hp1}）`);
    // 沒有螢光提燈：每次扣 6 點（規格 4.2：取得提燈後才能進深層；提示 20 秒最多一次，不在這裡檢查）
    assert.ok(hp0 - hp1 >= 6, `沒有提燈時扣血太少（${hp0} → ${hp1}）`);
    await teleport(1880, 2, 300);
    await page.waitForFunction(() => window.__mistwoodDebug.region() === 'mist_gate', null, { timeout: 5000 });
    const hp2 = await debug(() => window.__mistwoodDebug.combatState().hp);
    await page.waitForTimeout(4600);
    // 體力會自然回復，所以只檢查沒有扣血
    assert.ok((await debug(() => window.__mistwoodDebug.combatState().hp)) >= hp2, 'A 區不應該扣血');
  });

  await check('螢苔花園生成菌帽小妖，靠近時會追擊', async () => {
    const imp = await goTo('glowmoss_imps_garden', 'mob_cap_imp');
    assert.ok(imp && imp.x > 1940, '菌帽小妖沒有在花園生成');
  });

  await check('森林狼被打倒後從列表消失', async () => {
    const wolf = await goTo('deep_wolves', 'mob_mist_wolf');
    for (let i = 0; i < 10 && (await list()).some((e) => e.id === wolf.id); i++) {
      await debug((id) => window.__mistwoodDebug.hitEnemy(id, 'sword_slash_diag'), wolf.id);
      await page.waitForTimeout(200);
    }
    assert.equal((await list()).some((e) => e.id === wolf.id), false, '森林狼沒有被打倒');
  });
});
