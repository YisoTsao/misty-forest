// 端對端：任務 6D — 魔法（GAME_DESIGN 5.4）：星光值（MP）上限與 HUD；Q 星光衝擊：魔法陣蓄力 → 發動，周圍敵人受到資料上的傷害、
// 扣星光值、冷卻中不能再放、施法時手上拿魔杖；F 星屑飛彈：射出多枚追蹤彈命中前方的敵人；星光不足時不施放並提示；
// 星光值隨時間回復並寫入存檔；連續施放後粒子池與 geometry 數量不增長。特效外觀以截圖檢查（--magic）。
// 用法：pnpm build && node e2e/magic.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, tempSaveDir } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const spells = new Map(JSON.parse(readFileSync('src/data/spells.json', 'utf8')).map((s) => [s.id, s]));
const burst = spells.get('spell_starlight_burst');
const bolt = spells.get('spell_star_bolt');
const meteor = spells.get('spell_meteor_shower');
const saveDir = tempSaveDir();

await runE2e('magic e2e', { query: 'debug=1&play=1&peaceful=1', env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug }) => {
  const magic = () => debug(() => window.__mistwoodDebug.magic());
  // 只看霧林邊緣的迷霧噗啾（任務 7C 之後地圖其他地方也有怪物）
  const forestSpawners = spawners.filter((sp) => sp.regionId === 'forest' && sp.enemy === 'mist_wisp').map((sp) => sp.id);
  const enemies = () => debug((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))), forestSpawners);
  const player = () => debug(() => window.__mistwoodDebug.playerState());
  const [sx, sz] = spawners[0].center;
  const ready = () => page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });

  /** 站到血量最高的迷霧噗啾旁邊（distance 公尺）並面向牠 */
  const standNear = async (distance) => {
    const e = (await enemies()).sort((a, b) => b.hp - a.hp)[0];
    assert.ok(e, '沒有迷霧噗啾');
    await debug(([x, z, d]) => window.__mistwoodDebug.teleport(x - d, z), [e.x, e.z, distance]);
    await page.waitForTimeout(60);
    const now = (await enemies()).find((n) => n.id === e.id) ?? e;
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [now.x, now.z]);
    return now;
  };

  await check('新遊戲星光值全滿，HUD 顯示星光條與三個法術', async () => {
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x - 6, z + 6), [sx, sz]);
    await page.waitForFunction((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))).length >= 4, forestSpawners, { timeout: 30_000 });
    assert.equal((await magic()).mp, 100);
    assert.equal(await page.locator('[data-testid="mp-bar"]').count(), 1);
    assert.equal(await page.locator('[data-testid="skill-slot"]').count(), 1);
    assert.equal(await page.locator(`[data-testid="spell-slot-${bolt.id}"]`).count(), 1);
    assert.equal(await page.locator(`[data-testid="spell-slot-${meteor.id}"]`).count(), 1);
  });

  await check(`Q 星光衝擊：腳下魔法陣蓄力、手上換成魔杖，${burst.castTime} 秒後發動；扣 ${burst.mpCost} 星光`, async () => {
    await standNear(1.3);
    const before = await magic();
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(80);
    const charging = await magic();
    assert.equal(charging.casting, burst.id);
    assert.equal(charging.released, false);
    assert.ok(charging.vfx.circles >= 1, '沒有魔法陣');
    assert.ok(Math.abs(charging.mp - (before.mp - burst.mpCost)) < 1, `星光 ${before.mp} → ${charging.mp}`);
    assert.equal((await debug(() => window.__mistwoodDebug.melee())).shown, 'wand');
  });

  await check(`發動：範圍內的迷霧噗啾扣 ${burst.damage} 血、衝擊波與光閃、${burst.cooldown} 秒冷卻`, async () => {
    const p = await player();
    const near = (await enemies()).filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < burst.radius - 0.6);
    assert.ok(near.length >= 1, '身邊沒有迷霧噗啾');
    await page.waitForTimeout(burst.castTime * 1000 + 120);
    const m = await magic();
    assert.equal(m.released, true);
    assert.ok(m.vfx.shockwaves >= 1, '沒有衝擊波');
    assert.ok(m.vfx.lights >= 1, '沒有光閃');
    assert.ok(m.cooldowns[burst.id] > burst.cooldown - 1, `冷卻 ${m.cooldowns[burst.id]}`);
    const after = await enemies();
    for (const e of near) {
      const now = after.find((a) => a.id === e.id);
      assert.ok(!now || now.hp === e.hp - burst.damage, `${e.id}：${e.hp} → ${now?.hp}`);
    }
  });

  await check('冷卻中再按 Q 不會施放', async () => {
    await ready();
    const before = await magic();
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(150);
    const after = await magic();
    assert.equal(after.casts, before.casts);
    assert.equal(after.casting, null);
    assert.equal((await debug(() => window.__mistwoodDebug.melee())).shown, 'sword', '施法結束後應換回原本的武器');
  });

  await check(`F 星屑飛彈：射出 ${bolt.projectiles.count} 枚追蹤彈，命中前方的迷霧噗啾（每發 ${bolt.damage}）`, async () => {
    await debug(() => window.__mistwoodDebug.resetWorld());
    await page.waitForFunction((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))).filter((e) => e.hp === 60).length >= 3, forestSpawners, { timeout: 30_000 });
    await standNear(5);
    const before = await magic();
    const hpBefore = new Map((await enemies()).map((e) => [e.id, e.hp]));
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(bolt.castTime * 1000 + 100);
    assert.equal((await magic()).projectiles, bolt.projectiles.count);
    await page.waitForFunction(() => window.__mistwoodDebug.magic().projectiles === 0, null, { timeout: 3000 });
    const after = await magic();
    const hits = after.hits - before.hits;
    assert.ok(hits >= 1, '追蹤彈沒有命中');
    // 追蹤彈會打向前方最近的敵人（不一定是剛才面對的那隻）：所有敵人失去的血量合計 = 命中數 × 每發傷害
    const now = new Map((await enemies()).map((e) => [e.id, e.hp]));
    let lost = 0;
    for (const [id, hp] of hpBefore) lost += hp - (now.get(id) ?? 0);
    assert.ok(lost >= bolt.damage, `沒有敵人失血：${JSON.stringify([...now])}`);
    assert.ok(now.size < hpBefore.size || lost === hits * bolt.damage, `失血 ${lost}、命中 ${hits} 次`);
  });

  await check('星光不足時不施放、出現「星光不足」提示', async () => {
    await ready();
    await page.waitForTimeout(bolt.cooldown * 1000);
    await debug(() => window.__mistwoodDebug.setMp(5));
    const before = await magic();
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(150);
    const after = await magic();
    assert.equal(after.casts, before.casts);
    // 沒有被扣（回復是每秒結算一次，可能剛好多回 6）；仍低於消耗
    assert.ok(after.mp >= 5 && after.mp < bolt.mpCost, `mp=${after.mp}`);
    const toasts = await page.locator('[data-testid="toast"]').allInnerTexts();
    assert.ok(toasts.some((t) => /星光不足/.test(t)), JSON.stringify(toasts));
  });

  await check('星光值隨時間回復（每秒 6）', async () => {
    const a = await magic();
    await page.waitForTimeout(2500);
    const b = await magic();
    assert.ok(b.mp - a.mp > 9 && b.mp - a.mp < 20, `${a.mp} → ${b.mp}`);
  });

  await check('連續施放：粒子池容量固定、geometry 數量不增長、特效結束後粒子歸零', async () => {
    const castRound = async () => {
      for (let i = 0; i < 4; i++) {
        await ready();
        await page.waitForTimeout(bolt.cooldown * 1000 + 50);
        await debug(() => window.__mistwoodDebug.setMp(100));
        await page.keyboard.press('KeyF');
        await page.waitForTimeout(200);
      }
      await page.waitForTimeout(2500);
    };
    const geometries = async () => (await debug(() => window.__mistwoodDebug.perf())).geometries;
    const capacity = (await magic()).vfx.capacity;
    // 第一輪：第一次進入視野的草叢、新生成的迷霧噗啾等會建立 geometry（不是洩漏）
    await castRound();
    const geoWarm = await geometries();
    // 第二輪：同樣的施放；若每次施放都留下資源，這一輪會再增加至少 4 個
    await castRound();
    const busy = await magic();
    assert.equal(busy.vfx.capacity, capacity);
    assert.ok(busy.vfx.emitted > 100, `emitted=${busy.vfx.emitted}`);
    assert.ok(busy.vfx.alive < 20, `特效結束後仍有 ${busy.vfx.alive} 顆粒子`);
    const geoAfter = await geometries();
    assert.ok(geoAfter <= geoWarm + 3, `geometries ${geoWarm} → ${geoAfter}`);
  });

  await check(`C 流星雨：前方地面出現落點魔法陣，${meteor.meteor.count} 顆流星依序落下命中範圍內的迷霧噗啾；扣 ${meteor.mpCost} 星光`, async () => {
    await debug(() => window.__mistwoodDebug.resetWorld());
    await page.waitForFunction((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))).filter((e) => e.hp === 60).length >= 3, forestSpawners, { timeout: 30_000 });
    await debug(() => window.__mistwoodDebug.setMp(100));
    const target = await standNear(meteor.meteor.distance);
    const before = await magic();
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(100);
    const charging = await magic();
    assert.equal(charging.casting, meteor.id);
    assert.ok(charging.vfx.circles >= 2, `應有腳下與落點兩個魔法陣：${charging.vfx.circles}`);
    assert.ok(Math.abs(charging.mp - (100 - meteor.mpCost)) < 1, `mp=${charging.mp}`);
    const m = meteor.meteor;
    await page.waitForTimeout((meteor.castTime + m.count * m.interval + m.interval + m.fallTime) * 1000 + 600);
    const after = await magic();
    assert.ok(after.hits - before.hits >= 1, '流星沒有命中');
    assert.ok(after.cooldowns[meteor.id] > meteor.cooldown - 5, `冷卻 ${after.cooldowns[meteor.id]}`);
    const now = (await enemies()).find((e) => e.id === target.id);
    assert.ok(!now || (target.hp - now.hp) % meteor.damage === 0 && now.hp < target.hp, `目標 ${target.hp} → ${now?.hp}`);
  });

  await check('流星雨星光不足（< 60）時不施放', async () => {
    await ready();
    await page.waitForTimeout(400);
    await debug((v) => window.__mistwoodDebug.setMp(v), meteor.mpCost - 10);
    const before = await magic();
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(150);
    assert.equal((await magic()).casts, before.casts);
  });

  await check('星光值寫入存檔', async () => {
    await debug(() => window.__mistwoodDebug.setMp(33));
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.ok(file.combat.mp >= 33 && file.combat.mp < 40, `combat.mp=${file.combat.mp}`);
  });
});
