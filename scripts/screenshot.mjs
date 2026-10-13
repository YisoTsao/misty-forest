// 視覺驗證截圖（規格 8）：啟動 Electron 正式版，依序切換攝影機書籤並輸出圖片。
// 用法：node scripts/screenshot.mjs [階段名稱，預設 phase0] [--anim] [--mist] [--interact] [書籤 id...]
//   --anim：另外輸出角色每個必要動畫的定格圖（動畫來源驗證，規格 4.6）
//   --mist：每個書籤另外輸出迷霧外觀（<id>_mist.png，uMist = 1；規格 4.8 晴朗 / 迷霧兩種外觀）
//   --interact：輸出寶箱互動提示與開箱後畫面（任務 1C）
//   --menu：輸出主選單與暫停選單（Phase 1 驗收：可回到主選單）
// 注意：截圖只用來檢查畫面正確性，不可用於推斷效能。
/* global window -- page.evaluate / waitForFunction 的回呼在 Renderer 內執行 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const withAnim = flags.has('--anim');
const withMist = flags.has('--mist');
const withInteract = flags.has('--interact');
const withMenu = flags.has('--menu');
const [stage = 'phase0', ...only] = args.filter((a) => !a.startsWith('--'));
const outDir = path.join('docs', 'screenshots', stage);
mkdirSync(outDir, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, MISTWOOD_START_QUERY: 'debug=1&play=1' },
});

let exitCode = 0;
try {
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[renderer] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[renderer] ${err.message}`));

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });

  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
  };

  const setMist = async (value) => {
    await page.evaluate((v) => window.__mistwoodDebug.setMist(v, true), value);
    await page.waitForTimeout(300);
  };

  // 預設的跟隨相機視角
  await page.waitForTimeout(800);
  await shot('follow');
  if (withMist) {
    await setMist(1);
    await shot('follow_mist');
    await setMist(0);
  }

  const bookmarks = only.length > 0 ? only : await page.evaluate(() => window.__mistwoodDebug.bookmarks());
  for (const id of bookmarks) {
    await page.evaluate((b) => window.__mistwoodDebug.setBookmark(b), id);
    // 等待阻尼相機穩定與數幀渲染
    await page.waitForTimeout(1200);
    await shot(id);
    if (withMist) {
      await setMist(1);
      await shot(`${id}_mist`);
      await setMist(0);
    }
  }

  if (withInteract) {
    // 回到跟隨相機，站到寶箱前方面向寶箱
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.resetWorld();
      d.setCameraMode('follow');
      d.teleport(-3.0, 12.9);
      d.camera({ yaw: 1.3, pitch: 0.35, distance: 4.2 });
    });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() !== null, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await shot('interact_prompt');
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid="message-dialog"]', { timeout: 5000 });
    await page.waitForTimeout(400);
    await shot('interact_open');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    await shot('interact_after');
  }

  if (withMenu) {
    await page.evaluate(() => {
      const d = window.__mistwoodDebug;
      d.setCameraMode('follow');
      d.teleport(0, 18);
      d.camera({ yaw: 0, pitch: 0.35, distance: 6 });
      d.flow('pause');
    });
    await page.waitForSelector('[data-testid="pause-menu"]', { timeout: 5000 });
    await page.waitForTimeout(600);
    await shot('menu_pause');
    await page.evaluate(() => window.__mistwoodDebug.flow('returnToTitle'));
    await page.waitForSelector('[data-testid="title-screen"]', { timeout: 5000 });
    await page.waitForTimeout(1500);
    await shot('menu_title');
    await page.evaluate(() => window.__mistwoodDebug.flow('startGame'));
  }

  if (withAnim) {
    await page.evaluate(() => window.__mistwoodDebug.setBookmark('character'));
    await page.waitForTimeout(1200);
    const keys = await page.evaluate(() => window.__mistwoodDebug.animKeys());
    for (const key of keys) {
      await page.evaluate((k) => window.__mistwoodDebug.previewAnimation(k, 0.4), key);
      await page.waitForTimeout(250);
      await shot(`anim_${key}`);
    }
    await page.evaluate(() => window.__mistwoodDebug.previewAnimation(null));
  }

  const errors = await page.locator('[role="alert"]').allTextContents();
  if (errors.length > 0) {
    console.error('畫面上有錯誤訊息：', errors);
    exitCode = 1;
  }
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);
