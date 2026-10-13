// 端對端：任務 5D — 環境生命感（規格 4.3）：羊群在牧草地漫步、玩家靠近會走開、玩家遠離時暫停；
// 路標與告示板可閱讀（提示「閱讀」、E 開啟內容、Esc 關閉）。風車、炊煙、曬衣繩為純外觀，以截圖檢查（--ambient）。
// 用法：pnpm build && node e2e/ambient.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const [flockDef] = JSON.parse(readFileSync('src/data/ambient.json', 'utf8')).flocks;
const signpost = placements.find((p) => p.id === 'meadow_signpost_01');
const board = placements.find((p) => p.id === 'village_notice_board_01');

await runE2e('ambient e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, interactTarget }) => {
  const flock = () => debug((id) => window.__mistwoodDebug.flock(id), flockDef.id);
  const [cx, cz] = flockDef.center;
  const prompt = page.locator('[data-testid="interact-prompt"]');
  const dialog = page.locator('[data-testid="message-dialog"]');

  await check(`牧草地上有 ${flockDef.count} 隻羊，都在範圍內`, async () => {
    await teleport(cx, cz + flockDef.radius + 6);
    const f = await flock();
    assert.equal(f?.sheep.length, flockDef.count);
    assert.equal(f.paused, false);
    for (const s of f.sheep) assert.ok(Math.hypot(s.x - cx, s.z - cz) <= flockDef.radius + 0.01, JSON.stringify(s));
  });

  await check('羊會自己走動（漫步 / 吃草 / 休息）', async () => {
    const before = (await flock()).sheep;
    await page.waitForTimeout(9000);
    const after = (await flock()).sheep;
    const moved = after.filter((s, i) => Math.hypot(s.x - before[i].x, s.z - before[i].z) > 0.3).length;
    assert.ok(moved >= 1, `沒有羊走動：${JSON.stringify(after)}`);
  });

  await check('玩家走到羊旁邊：那隻羊走開', async () => {
    const [target] = (await flock()).sheep;
    await teleport(target.x + 1.6, target.z, 200);
    await page.waitForTimeout(1500);
    const now = (await flock()).sheep[0];
    const s = await debug(() => window.__mistwoodDebug.playerState());
    assert.ok(Math.hypot(now.x - s.x, now.z - s.z) > 2.6, `羊沒有走開：距離 ${Math.hypot(now.x - s.x, now.z - s.z).toFixed(2)}`);
  });

  await check('玩家遠離後整群暫停、位置不再改變', async () => {
    await teleport(60, -58, 500);
    const a = await flock();
    assert.equal(a.paused, true);
    await page.waitForTimeout(2000);
    const b = await flock();
    assert.deepEqual(b.sheep, a.sheep);
  });

  await check('路標：提示「閱讀 路標」，E 開啟、Esc 關閉', async () => {
    await teleport(signpost.position[0], signpost.position[2] + 1.6);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [signpost.position[0], signpost.position[2]]);
    await prompt.waitFor({ timeout: 3000 });
    assert.equal(await interactTarget(), signpost.id);
    assert.match(await prompt.innerText(), /閱讀\s*路標/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /晨曦村/);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('告示板：可閱讀，內容提到木匠波木與羊群', async () => {
    const yaw = board.rotation[1];
    await teleport(board.position[0] + Math.sin(yaw) * 1.6, board.position[2] + Math.cos(yaw) * 1.6);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [board.position[0], board.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, board.id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ timeout: 2000 });
    const text = await dialog.innerText();
    assert.match(text, /波木/);
    assert.match(text, /羊群/);
    await page.keyboard.press('Escape');
  });
});
