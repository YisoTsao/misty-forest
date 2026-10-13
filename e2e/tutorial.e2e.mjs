// 端對端：任務 2D — 教學引導（移動 → 開寶箱 → 採集 → 開背包 → 結語），進度隨存檔保存。
// 用法：pnpm build && node e2e/tutorial.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, standSouthOf, tempSaveDir } from './lib.mjs';

const saveDir = tempSaveDir();
const chest = placements.find((p) => p.prefabId === 'chest_wood');
const flower = placements.find((p) => p.id === 'meadow_flower_001');

await runE2e('tutorial e2e', { env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug, camera, teleport }) => {
  const panel = page.locator('[data-testid="tutorial"]');
  const stepIs = async (step) => {
    await page.locator(`[data-testid="tutorial"][data-step="${step}"]`).waitFor({ timeout: 3000 });
  };

  await check('新遊戲開始時顯示第一步：移動', async () => {
    await stepIs('move');
    assert.match(await panel.innerText(), /W A S D/);
  });

  await check('移動 4 m 後進入「打開寶箱」', async () => {
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800);
    await page.keyboard.up('KeyW');
    await stepIs('interact');
    assert.match(await panel.innerText(), /寶箱/);
  });

  await check('打開寶箱後進入「採集」', async () => {
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4);
    await page.keyboard.press('KeyE');
    await stepIs('harvest');
    // 關閉開箱後的紙條
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 3000 });
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('採集後進入「打開背包」', async () => {
    await page.waitForTimeout(800);
    await teleport(...standSouthOf(flower, 1.1));
    await page.keyboard.press('KeyE');
    await stepIs('inventory');
  });

  await check('打開背包後顯示結語，教學完成', async () => {
    await page.keyboard.press('KeyI');
    await stepIs('done');
    assert.match(await panel.innerText(), /村莊/);
    await page.keyboard.press('KeyI');
  });

  await check('教學進度寫入存檔', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.equal(file.tutorial, 'done');
  });

  await check('結語約 9 秒後消失', async () => {
    await panel.waitFor({ state: 'detached', timeout: 11_000 });
  });
});
