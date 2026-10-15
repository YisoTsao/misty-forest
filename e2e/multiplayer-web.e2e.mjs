// 端對端：任務 11A — 架構文件的驗收「Web 兩個分頁連到 localhost 的同一個房間」。
// 用 vite preview 提供建置好的 dist（Web 版，和 Electron 共用同一份前端與連線模組），
// 同一個 Chromium 開兩個分頁自動連線：看得到彼此、人數 2；關掉一個分頁後另一個移除該玩家。
// 需要 Playwright 的 Chromium（npx playwright install chromium）；不在 e2e:all 內。
// 用法：pnpm build && node e2e/multiplayer-web.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const GAME_PORT = 2598;
const WEB_PORT = 4179;
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

function kill(child) {
  if (child.exitCode === null) child.kill('SIGKILL');
}

const server = spawn(process.execPath, ['dist-server/server.mjs'], { env: { ...process.env, GAME_SERVER_PORT: String(GAME_PORT) }, stdio: 'ignore' });
const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(WEB_PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  await Promise.all([waitFor(`http://localhost:${GAME_PORT}/health`), waitFor(`http://localhost:${WEB_PORT}/`)]);
  browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const open = async (name) => {
    const page = await context.newPage();
    page.on('pageerror', (err) => console.error(`[${name}] ${err.message}`));
    await page.goto(`http://localhost:${WEB_PORT}/?debug=1&play=1&peaceful=1&mp=1&server=ws://localhost:${GAME_PORT}&mpName=${name}`);
    await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 120_000 });
    return page;
  };
  const tab1 = await open('Web1');
  const tab2 = await open('Web2');

  await check('兩個分頁連到同一個房間、人數 2、看得到彼此', async () => {
    for (const page of [tab1, tab2]) {
      await page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected' && window.__mistwoodDebug.net().playerCount === 2, null, { timeout: 15_000 });
    }
    const [n1, n2] = await Promise.all([tab1, tab2].map((p) => p.evaluate(() => window.__mistwoodDebug.net().roomId)));
    assert.equal(n1, n2);
    assert.deepEqual(await tab1.evaluate(() => window.__mistwoodDebug.remotePlayers().map((r) => r.name)), ['Web2']);
    assert.deepEqual(await tab2.evaluate(() => window.__mistwoodDebug.remotePlayers().map((r) => r.name)), ['Web1']);
  });

  await check('關掉一個分頁，另一個分頁移除該玩家、人數 1', async () => {
    await tab2.close();
    await tab1.waitForFunction(() => window.__mistwoodDebug.remotePlayers().length === 0 && window.__mistwoodDebug.net().playerCount === 1, null, { timeout: 10_000 });
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await browser?.close();
  kill(server);
  kill(web);
}

console.log(`multiplayer-web e2e\n${results.join('\n')}`);
if (failed) process.exitCode = 1;
