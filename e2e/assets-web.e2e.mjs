// 端對端（Web 版）：資源依種類打包、顯示進度與剩餘時間、存進瀏覽器快取（使用者 2026-10-21）。
// 用 vite preview 提供建置好的 dist，Playwright 的 Chromium 開啟：
// 1. 第一次進入（限速下載）：載入畫面列出各種類與剩餘時間；模型與音效只下載幾個 gzip 壓縮的包（共約 4 MB），
//    不再逐檔請求 /models、/audio；下載完後的場景準備顯示已載入的模型數。
// 2. 重新整理：所有包都從快取讀出，沒有任何包或零散資源的網路請求。
// 3. 進入遊戲後的技能與按鈕圖示（觸控介面與鍵盤 HUD）是 SVG，不是 emoji。
// 截圖存到 docs/screenshots/loading/。需要 Playwright 的 Chromium（npx playwright install chromium）。
// 用法：pnpm build && node e2e/assets-web.e2e.mjs
/* global window, document, MutationObserver, Element, HTMLElement */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const WEB_PORT = 4181;
const SHOTS = 'docs/screenshots/loading';
const results = [];
let failed = false;

async function check(name, fn) {
  try {
    await fn();
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failed = true;
    results.push(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

async function waitFor(url, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // 還沒啟動
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} 沒有在時間內啟動`);
}

mkdirSync(SHOTS, { recursive: true });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(WEB_PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await waitFor(`http://localhost:${WEB_PORT}/`);
  browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  // 同一個 context 才會共用 Cache Storage（模擬同一個瀏覽器重新整理）
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error(`[page] ${err.message}`));
  /** 記錄資源請求（只算真的走網路的：Cache Storage 讀出的不會經過這裡） */
  let requests = [];
  page.on('request', (req) => {
    const u = new URL(req.url());
    if (u.protocol.startsWith('http')) requests.push(u.pathname);
  });
  const url = `http://localhost:${WEB_PORT}/?debug=1&play=1&peaceful=1&clock=12`;

  await check('第一次進入：依種類下載資源包，載入畫面顯示各種類進度與剩餘時間', async () => {
    // 限速 8 Mbps，讓下載過程看得到（包壓縮後只剩約 4 MB）
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: (8 * 1024 * 1024) / 8, uploadThroughput: 1024 * 1024 });
    await page.goto(url);
    await page.waitForSelector('[data-testid="loading-packs"]', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="loading-eta"]')?.textContent?.includes('預估剩餘'), null, { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/first_load_downloading.png` });
    const rows = await page.locator('[data-testid^="loading-pack-"]').count();
    assert.equal(rows, 5, '五個種類');
    const labels = await page.locator('[data-testid="loading-packs"]').innerText();
    for (const name of ['角色', '怪物', '建築與道具', '花草樹木', '音效']) assert.ok(labels.includes(name), `列出 ${name}`);
    // 下載完後的場景準備：列出已載入的模型數，不是停在 99% 不動
    await page.waitForSelector('[data-testid="loading-models"]', { timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/first_load_preparing.png` });
    await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 180_000 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const report = await page.evaluate(() => window.__mistwoodDebug.assetLoad());
    assert.equal(report.phase, 'ready');
    assert.ok(report.packs.every((p) => p.done && !p.cached), '第一次全部從網路下載');
    // gzip 與模型壓縮後整體下載量（原本 23 MB）
    assert.ok(report.networkBytes < 6 * 1024 * 1024, `下載量 ${(report.networkBytes / 1024 / 1024).toFixed(1)} MB`);
    assert.ok(report.mapped > 250, `對應到包裡的檔案 ${report.mapped}`);
    const packRequests = requests.filter((p) => p.startsWith('/packs/') && p.endsWith('.bin'));
    const loose = requests.filter((p) => p.startsWith('/models/') || p.startsWith('/audio/'));
    assert.equal(packRequests.length, 5, `包的請求：${packRequests.join(', ')}`);
    assert.deepEqual(loose, [], '沒有零散的模型與音效請求');
  });

  await check('重新整理：所有種類都從快取讀出，不再下載', async () => {
    requests = [];
    // 記錄載入畫面的種類列表是否出現過（快取命中時不該出現，連閃一下也不行）
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(() => {
          if (document.querySelector('[data-testid="loading-packs"]')) window.__sawPacks = true;
        }).observe(document, { childList: true, subtree: true });
      });
    });
    await page.reload();
    await page.waitForSelector('[data-testid="loading-screen"]', { timeout: 20_000 }).catch(() => {});
    await page.screenshot({ path: `${SHOTS}/reload_cached.png` });
    await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 120_000 });
    const report = await page.evaluate(() => window.__mistwoodDebug.assetLoad());
    assert.equal(report.phase, 'ready');
    assert.ok(report.packs.every((p) => p.cached), `每個種類都從快取：${JSON.stringify(report.packs.map((p) => [p.category, p.cached]))}`);
    assert.equal(report.networkBytes, 0);
    assert.equal(await page.evaluate(() => window.__sawPacks === true), false, '快取命中時不顯示種類列表（連閃一下也不行）');
    const assetRequests = requests.filter((p) => p.startsWith('/packs/') || p.startsWith('/models/') || p.startsWith('/audio/'));
    // 只剩清單本身（每次向伺服器確認版本）
    assert.deepEqual(assetRequests, ['/packs/manifest.json']);
  });

  await check('鍵盤 HUD：武器、重擊與法術是 SVG 圖示', async () => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/hud_icons.png` });
    const slot = page.locator('[data-testid="skill-slot"]');
    assert.equal(await slot.locator('svg[data-skill-icon]').count(), 1);
    assert.equal(await page.locator('[data-testid="attack-slot"] svg[data-action-icon]').count(), 1);
    assert.equal(await page.locator('[data-testid="weapon-selector"] svg[data-action-icon]').count(), 3);
  });

  await check('沒有 Pointer Lock API 的瀏覽器（iOS Safari）：點畫面不會丟錯', async () => {
    // iOS Safari 沒有 requestPointerLock，這裡模擬把它拿掉，點畫面（會嘗試鎖定滑鼠）不能出錯
    const ios = await context.newPage();
    const errors = [];
    ios.on('pageerror', (err) => errors.push(err.message));
    await ios.addInitScript(() => {
      delete Element.prototype.requestPointerLock;
      delete HTMLElement.prototype.requestPointerLock;
    });
    await ios.goto(url);
    await ios.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 120_000 });
    await ios.mouse.click(640, 360);
    await ios.mouse.click(640, 360);
    await ios.waitForTimeout(500);
    await ios.close();
    assert.deepEqual(errors, []);
  });

  await check('觸控介面：按鈕與選單鈕都是 SVG 圖示，法術用職業的技能圖示', async () => {
    const touch = await context.newPage();
    await touch.setViewportSize({ width: 844, height: 390 });
    await touch.goto(`${url}&touch=1`);
    await touch.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 120_000 });
    await touch.waitForSelector('[data-testid="touch-buttons"]', { state: 'attached', timeout: 10_000 });
    await touch.waitForTimeout(1500);
    await touch.screenshot({ path: `${SHOTS}/touch_icons.png` });
    for (const id of ['touch-attack', 'touch-heavy', 'touch-interact', 'touch-jump', 'touch-weapon', 'touch-heal', 'touch-pause', 'touch-inventory', 'touch-map', 'touch-journal', 'touch-companion']) {
      assert.equal(await touch.locator(`[data-testid="${id}"] svg`).count(), 1, id);
    }
    assert.equal(await touch.locator('[data-testid="touch-skill"] svg[data-skill-icon="starlight_burst"]').count(), 1, '星光爆發');
    // 離線沒有聊天功能，聊天鈕不顯示（連線後才有，見 multiplayer-web e2e）
    assert.equal(await touch.locator('[data-testid="touch-chat"]').count(), 0, '離線不顯示聊天鈕');
    const emoji = await touch.locator('[data-testid="touch-buttons"], [data-testid="touch-menu"]').evaluateAll((els) => els.map((e) => e.textContent).join(''));
    assert.ok(!/\p{Extended_Pictographic}/u.test(emoji), `不再有 emoji：${emoji}`);
    await touch.close();
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await browser?.close();
  if (web.exitCode === null) web.kill('SIGKILL');
}

console.log(`assets-web e2e\n${results.join('\n')}`);
if (failed) process.exitCode = 1;
