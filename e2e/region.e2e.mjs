// 端對端：任務 3A — 各區域迷霧。區域判定與名稱、依位置混合的迷霧外觀、迷霧階段改變後畫面變亮、
// 進入新區域自動存檔、迷霧階段隨存檔保存。
// 用法：pnpm build && node e2e/region.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, prefabs, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const regions = JSON.parse(readFileSync('src/data/regions.json', 'utf8'));
const forest = regions.find((r) => r.id === 'forest').area;

/** 森林中心附近一塊 3.6 m 內沒有樹的空地（攝影機不會鑽進樹冠） */
function forestClearing() {
  const [cx, cz] = forest.center;
  for (let r = 0; r < forest.radius * 0.8; r += 1) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const blocked = placements.some((p) => prefabs.get(p.prefabId).collider === 'static' && Math.hypot(p.position[0] - x, p.position[2] - z) < 3.6);
      if (!blocked) return [x, z];
    }
  }
  throw new Error('森林裡找不到空地');
}
const clearing = forestClearing();
const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const primary = path.join(env.MISTWOOD_SAVE_DIR, 'slot1.json');

/** 畫面中央區域的平均飽和度與亮度（HSV） */
const lookOf = (page) =>
  page.evaluate(() => {
    const src = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let sat = 0;
    let val = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      sat += max === 0 ? 0 : (max - min) / max;
      val += max / 255;
    }
    const n = data.length / 4;
    return { sat: sat / n, val: val / n };
  });

await runE2e('region e2e（1/2）', { query: 'debug=1&play=1&peaceful=1', env }, async ({ page, check, debug, camera, teleport }) => {
  const mist = () => debug(() => window.__mistwoodDebug.mist());
  const region = () => debug(() => window.__mistwoodDebug.region());
  let forestLook = null;

  await check('出生草原：區域為草原、沒有迷霧覆寫、畫面晴朗', async () => {
    assert.equal(await region(), 'meadow');
    const m = await mist();
    assert.equal(m.override, null);
    assert.ok(m.current < 0.05, `current=${m.current}`);
  });

  await check('進入森林：顯示「霧林邊緣 濃霧籠罩」，迷霧平滑升到 1', async () => {
    await teleport(...clearing, 200);
    await camera({ yaw: 0.5, pitch: 0.55, distance: 5 });
    const banner = page.locator('[data-testid="region-banner"]');
    await banner.waitFor({ timeout: 2000 });
    assert.match(await banner.innerText(), /霧林邊緣[\s\S]*濃霧籠罩/);
    assert.equal(await region(), 'forest');
    const early = await mist();
    assert.ok(early.current < 0.95, `沒有漸變：${early.current}`);
    await page.waitForTimeout(2500);
    assert.ok((await mist()).current > 0.98);
    forestLook = await lookOf(page);
  });

  await check('進入新區域時自動存檔', async () => {
    await page.waitForTimeout(500);
    assert.ok(existsSync(primary), '沒有存檔');
    assert.equal(JSON.parse(readFileSync(primary, 'utf8')).version, SAVE_VERSION);
  });

  await check('區域邊界：迷霧依距離平滑混合（約一半）', async () => {
    const edgeX = forest.center[0] - forest.radius;
    await teleport(edgeX, forest.center[1], 300);
    const m = await mist();
    assert.ok(m.target > 0.3 && m.target < 0.7, `邊界 target=${m.target}`);
  });

  await check('森林迷霧改為「清」後，森林畫面明顯變亮、變鮮豔（規格 Phase 3 驗收）', async () => {
    await teleport(...clearing, 200);
    await camera({ yaw: 0.5, pitch: 0.55, distance: 5 });
    await page.waitForTimeout(2500);
    forestLook = await lookOf(page);
    await debug(() => window.__mistwoodDebug.setMistStage('forest', 'clear'));
    await page.waitForTimeout(3000);
    assert.ok((await mist()).current < 0.02);
    const clearLook = await lookOf(page);
    assert.ok(clearLook.sat > forestLook.sat * 1.4, `飽和度 ${forestLook.sat.toFixed(3)} → ${clearLook.sat.toFixed(3)}`);
    assert.ok(clearLook.val > forestLook.val * 0.98, `亮度 ${forestLook.val.toFixed(3)} → ${clearLook.val.toFixed(3)}`);
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).forest, 'clear');
  });

  await check('除錯覆寫優先於區域；「依區域」回到區域迷霧', async () => {
    await debug(() => window.__mistwoodDebug.setMist(1));
    assert.equal((await mist()).target, 1);
    await page.locator('[data-testid="mist-by-region"]').click();
    const m = await mist();
    assert.equal(m.override, null);
    assert.equal(m.target, 0);
  });

  await check('存檔記錄森林的迷霧階段', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    assert.equal(JSON.parse(readFileSync(primary, 'utf8')).mist.forest, 'clear');
  });
});

await runE2e('region e2e（2/2 讀檔）', { query: 'debug=1', env }, async ({ page, check, debug }) => {
  await check('繼續遊戲後森林仍是晴朗，畫面迷霧接近 0', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-screen"]').waitFor({ state: 'detached', timeout: 5000 });
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).forest, 'clear');
    await page.waitForTimeout(400); // 存檔位置在下一幀套用
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'forest');
    await page.waitForTimeout(2000);
    assert.ok((await debug(() => window.__mistwoodDebug.mist())).current < 0.05);
  });
});
