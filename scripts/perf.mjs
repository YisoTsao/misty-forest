// 實機效能量測（規格 7）：以「有視窗」的 Electron 正式版在本機 GPU 上量測，輸出 Markdown 表格。
// 用法：pnpm build && node scripts/perf.mjs [--soak 秒數]
//   1. 冷啟動：啟動到場景就緒（主選單可操作）的時間
//   2. 每個畫質 × 每個視角：FPS（受螢幕更新率限制，即實際體驗）、draw calls、三角面
//   3. 不限幀率（--disable-gpu-vsync --disable-frame-rate-limit）時的 FPS：剩餘效能
//   4. 連續遊玩（自動沿路線來回跑）期間的 JS heap、geometry、texture 數量變化
// 注意：量測時請讓視窗留在前景、不要操作電腦；被遮住或縮小的視窗會被系統降頻。
/* global window */
import { _electron as electron } from 'playwright';

const args = process.argv.slice(2);
const soakIndex = args.indexOf('--soak');
const soakSec = soakIndex >= 0 ? Number(args[soakIndex + 1]) : 180;

const VIEWS = ['follow', 'meadow', 'village', 'forest', 'overlook'];
const QUALITIES = ['low', 'medium', 'high'];
const SAMPLE_MS = 3000;

async function launch(query, extraArgs = []) {
  const started = Date.now();
  const app = await electron.launch({
    args: ['.', ...extraArgs],
    env: { ...process.env, MISTWOOD_START_QUERY: query },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 90_000 });
  return { app, page, readyMs: Date.now() - started };
}

async function setView(page, view) {
  await page.evaluate((v) => {
    const d = window.__mistwoodDebug;
    if (v === 'follow') {
      d.setCameraMode('follow');
      d.teleport(0, 18);
      d.camera({ yaw: 0, pitch: 0.3, distance: 6 });
    } else {
      d.setBookmark(v);
    }
  }, view);
  await page.waitForTimeout(1500);
}

/** SAMPLE_MS 內每 250 ms 取樣，回傳平均 FPS 與最大 draw calls / 三角面 */
async function sample(page) {
  const samples = [];
  for (let t = 0; t < SAMPLE_MS; t += 250) {
    await page.waitForTimeout(250);
    samples.push(await page.evaluate(() => window.__mistwoodDebug.perf()));
  }
  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  const max = (k) => Math.max(...samples.map((s) => s[k]));
  return { fps: avg('fps'), frameMs: avg('frameMs'), draws: max('drawCalls'), tris: max('triangles') };
}

const rows = [];
const fmt = (n, d = 0) => n.toFixed(d);

// 1 + 2：一般模式（受 vsync 限制）
let coldStartMs = 0;
for (const quality of QUALITIES) {
  const { app, page, readyMs } = await launch(`debug=1&play=1&quality=${quality}`);
  if (quality === 'high') coldStartMs = readyMs;
  for (const view of VIEWS) {
    await setView(page, view);
    rows.push({ quality, view, vsync: await sample(page) });
  }
  await app.close();
}

// 3：不限幀率
for (const quality of QUALITIES) {
  const { app, page } = await launch(`debug=1&play=1&quality=${quality}`, ['--disable-gpu-vsync', '--disable-frame-rate-limit']);
  for (const view of VIEWS) {
    await setView(page, view);
    const s = await sample(page);
    const row = rows.find((r) => r.quality === quality && r.view === view);
    if (row) row.uncapped = s;
  }
  await app.close();
}

// 4：連續遊玩（高畫質）：沿小路往返跑步，每 15 秒記錄一次
const soak = [];
{
  const { app, page } = await launch('debug=1&play=1&quality=high');
  await page.evaluate(() => {
    const d = window.__mistwoodDebug;
    d.setCameraMode('follow');
    d.teleport(0, 18);
  });
  await page.keyboard.down('ShiftLeft');
  const start = Date.now();
  let leg = 0;
  while (Date.now() - start < soakSec * 1000) {
    // 每段 15 秒：前進並切換方向，經過草原、村莊與森林
    const yaw = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5][leg % 4];
    await page.evaluate((y) => window.__mistwoodDebug.camera({ yaw: y }), yaw);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(15_000);
    await page.keyboard.up('KeyW');
    const p = await page.evaluate(() => window.__mistwoodDebug.perf());
    soak.push({ t: Math.round((Date.now() - start) / 1000), heap: p.jsHeapMB, geo: p.geometries, tex: p.textures, fps: p.fps });
    leg++;
  }
  await page.keyboard.up('ShiftLeft');
  await app.close();
}

console.log(`\n冷啟動到場景就緒（高畫質）：${(coldStartMs / 1000).toFixed(1)} s\n`);
console.log('| 畫質 | 視角 | FPS（vsync） | FPS（不限幀） | 每幀 ms（不限幀） | draw calls | 三角面 |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  const u = r.uncapped;
  console.log(
    `| ${r.quality} | ${r.view} | ${fmt(r.vsync.fps)} | ${u ? fmt(u.fps) : '-'} | ${u ? fmt(u.frameMs, 1) : '-'} | ${r.vsync.draws} | ${r.vsync.tris.toLocaleString('en-US')} |`,
  );
}
console.log('\n連續遊玩（高畫質）');
console.log('| 秒 | JS heap MB | geometries | textures | FPS |');
console.log('|---|---|---|---|---|');
for (const s of soak) console.log(`| ${s.t} | ${s.heap?.toFixed(1) ?? '-'} | ${s.geo} | ${s.tex} | ${fmt(s.fps)} |`);
