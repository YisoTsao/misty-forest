// 端對端：任務 2A — 採集（樹木、岩石、花叢、草藥）、物品進背包、通知、不可重複採集、重生。
// 用法：pnpm build && node e2e/harvest.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, prefabs, runE2e, standSouthOf } from './lib.mjs';

/** 四周 6 m 內沒有其他可互動物件，避免選到別的目標 */
function isolated(prefabFilter) {
  return placements.find((p) => {
    if (!prefabFilter(p.prefabId)) return false;
    const [x, , z] = p.position;
    if (Math.abs(x) > 60 || Math.abs(z) > 60) return false;
    return !placements.some((o) => o !== p && prefabs.get(o.prefabId).interaction && Math.hypot(o.position[0] - x, o.position[2] - z) < 6);
  });
}

const tree = isolated((id) => id.startsWith('tree_'));
const rock = isolated((id) => id === 'rock_round' || id === 'rock_tall');
const flower = isolated((id) => id === 'flower_patch');
const herb = isolated((id) => id === 'herb_bush');
assert.ok(tree && rock && flower && herb, '找不到合適的測試物件');

await runE2e('harvest e2e', {}, async ({ page, check, debug, state, teleport, objectState, itemCount, interactTarget }) => {
  const prompt = page.locator('[data-testid="interact-prompt"]');
  await debug(() => window.__mistwoodDebug.resetWorld());

  /** 走到物件旁（面向它）、確認提示、按 E，等待指令送出 */
  const harvest = async (target, distance, expectedAnim) => {
    await teleport(...standSouthOf(target, distance));
    await page.waitForTimeout(300);
    assert.equal(await interactTarget(), target.id, `提示目標不是 ${target.id}`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
    assert.equal((await state()).action, expectedAnim);
    await page.waitForTimeout(700);
  };

  await check(`靠近樹木（${tree.id}）顯示「採集 樹木」`, async () => {
    await teleport(...standSouthOf(tree, 1.5));
    await prompt.waitFor({ timeout: 3000 });
    assert.match(await prompt.innerText(), /採集\s*樹木/);
  });

  await check('按 E 砍樹：播放揮砍動作、樹變成樹樁、獲得 2–3 個木材並顯示通知', async () => {
    await harvest(tree, 1.5, 'attack');
    const obj = await objectState(tree.id);
    assert.equal(obj?.harvested, true, JSON.stringify(obj));
    assert.ok(obj.respawnAt > 0, '沒有記錄重生時間');
    const wood = await itemCount('wood');
    assert.ok(wood >= 2 && wood <= 3, `木材 ${wood}`);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.itemId === 'wood'), `通知：${JSON.stringify(toasts)}`);
    await page.locator('[data-testid="toast"]').first().waitFor({ timeout: 1000 });
  });

  await check('採集後不再提示，按 E 不會重複採集', async () => {
    await page.waitForTimeout(500);
    assert.equal(await interactTarget(), null);
    const before = await itemCount('wood');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.equal(await itemCount('wood'), before);
    assert.equal((await state()).action, null);
  });

  await check('樹樁仍有碰撞：角色不會穿進樹樁（矮樹樁可以踩上去）', async () => {
    const [tx, ty, tz] = tree.position;
    const prefab = prefabs.get(tree.prefabId);
    const { radius, height } = prefab.harvest.harvestedCollision;
    const [sx, sy] = tree.scale;
    const top = ty + height * sy;
    const FOOT_OFFSET = 0.46 + 0.32; // 膠囊中心到腳底（characters.json traveler）
    await teleport(tx, tz + 3);
    await page.keyboard.down('KeyW');
    let clipped = null;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(80);
      const s = await state();
      const d = Math.hypot(s.x - tx, s.z - tz);
      // 水平上與樹樁重疊時，腳底必須在樹樁頂面以上
      if (d < radius * sx + 0.32 - 0.08 && s.y - FOOT_OFFSET < top - 0.08) clipped = { d, feet: s.y - FOOT_OFFSET, top };
    }
    await page.keyboard.up('KeyW');
    assert.equal(clipped, null, `穿進樹樁：${JSON.stringify(clipped)}`);
  });

  await check('玩家站在樹樁旁時時間到也不重生；離開後重生並可再採集', async () => {
    const [tx, , tz] = tree.position;
    await debug(([x, z]) => window.__mistwoodDebug.send({ type: 'AdvanceTime', dt: 700, player: { x, z } }), [tx + 1, tz]);
    assert.equal((await objectState(tree.id))?.harvested, true, '玩家在旁邊時重生了');
    await debug(() => window.__mistwoodDebug.send({ type: 'AdvanceTime', dt: 1, player: { x: 0, z: 0 } }));
    assert.equal(await objectState(tree.id), null, '離開後沒有重生');
    await teleport(...standSouthOf(tree, 1.5));
    await page.waitForTimeout(300);
    assert.equal(await interactTarget(), tree.id);
  });

  await check(`敲岩石（${rock.id}）獲得石頭`, async () => {
    await harvest(rock, 1.9, 'attack');
    assert.equal((await objectState(rock.id))?.harvested, true);
    assert.ok((await itemCount('stone')) >= 1);
  });

  await check(`摘花叢（${flower.id}）：播放伸手動作、花叢消失、獲得花朵`, async () => {
    await harvest(flower, 1.1, 'interact');
    assert.equal((await objectState(flower.id))?.harvested, true);
    assert.ok((await itemCount('flower')) >= 1);
  });

  await check(`採草藥（${herb.id}）獲得草藥`, async () => {
    await harvest(herb, 1.1, 'interact');
    assert.equal((await objectState(herb.id))?.harvested, true);
    assert.ok((await itemCount('herb')) >= 1);
  });

  await check('遊戲時間只在遊玩中前進，暫停時停止', async () => {
    const t0 = await debug(() => window.__mistwoodDebug.gameTime());
    await page.waitForTimeout(2200);
    const t1 = await debug(() => window.__mistwoodDebug.gameTime());
    assert.ok(t1 - t0 >= 1, `遊玩中時間沒有前進：${t0} → ${t1}`);
    await debug(() => window.__mistwoodDebug.flow('pause'));
    const p0 = await debug(() => window.__mistwoodDebug.gameTime());
    await page.waitForTimeout(2200);
    const p1 = await debug(() => window.__mistwoodDebug.gameTime());
    await debug(() => window.__mistwoodDebug.flow('resume'));
    assert.equal(p1, p0, '暫停時時間仍在前進');
  });
});
