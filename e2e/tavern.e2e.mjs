// 端對端：任務 5B — 可進入建築（規格 5.1、5.2）：酒館門口提示、黑幕轉場進入室內子場景、站在室內地板上、
// 室內沒有霧、和老闆娘茉莉對話與休息、從門墊離開回到門口、在室內存檔記錄門口的位置。
// 用法：pnpm build && node e2e/tavern.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, tempSaveDir } from './lib.mjs';

const saveDir = tempSaveDir();
const interior = JSON.parse(readFileSync('src/data/interiors.json', 'utf8'))[0];

await runE2e('tavern e2e', { env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug, state, teleport, interactTarget }) => {
  const location = () => debug(() => window.__mistwoodDebug.location());

  await check('酒館門口顯示「進入 酒館」', async () => {
    await teleport(-6.4, -30, 600);
    await debug(() => window.__mistwoodDebug.face(-2.5, -30));
    await page.waitForTimeout(300);
    assert.equal(await interactTarget(), 'village_tavern_03');
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /進入\s*酒館/);
  });

  await check('按 E：黑幕轉場後進到酒館裡，站在室內地板上、沒有霧', async () => {
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.location() === 'tavern', null, { timeout: 3000 });
    await page.waitForTimeout(1200);
    const s = await state();
    assert.ok(Math.hypot(s.x - interior.inside[0], s.z - interior.inside[1]) < 0.5, `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded && Math.abs(s.y - 0.78) < 0.2, `沒有站在地板上：y=${s.y.toFixed(2)}`);
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).target === 0);
  });

  await check('室內在牆內走動不會掉出去', async () => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    const s = await state();
    assert.ok(Math.abs(s.x - interior.origin[0]) < 6 && Math.abs(s.z - interior.origin[1]) < 4.5, '走出了房間');
    assert.equal(s.respawnCount, 0);
  });

  await check('和茉莉對話，選「休息一下」', async () => {
    await teleport(interior.origin[0] - 3.2, interior.origin[1] - 1.3, 300);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [interior.origin[0] - 3.2, interior.origin[1] - 3.6]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:molly', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'greet', null, { timeout: 3000 });
    await page.keyboard.press('Digit1');
    assert.equal(await debug(() => window.__mistwoodDebug.dialogue()?.nodeId), 'rested');
    assert.equal((await debug(() => window.__mistwoodDebug.combatState())).hp, 100);
    await page.keyboard.press('Escape');
  });

  await check('在室內存檔：記錄的是酒館門口', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.ok(Math.hypot(file.player.position.x + 7.1, file.player.position.z + 30) < 0.3, JSON.stringify(file.player.position));
  });

  await check('走到門墊按 E 離開：回到酒館門口、背對建築', async () => {
    await teleport(interior.origin[0], interior.origin[1] + 3.2, 300);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'tavern_exit', null, { timeout: 3000 });
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /離開\s*酒館/);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.location() === 'overworld', null, { timeout: 3000 });
    await page.waitForTimeout(1000);
    const s = await state();
    assert.ok(Math.hypot(s.x + 7.1, s.z + 30) < 0.5, `位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    assert.ok(s.grounded);
    assert.equal(await location(), 'overworld');
  });
});
