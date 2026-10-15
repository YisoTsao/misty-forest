// 端對端：任務 11A / 11B — 多人連線（Colyseus）。
// 啟動建置好的遊戲伺服器（dist-server，埠 2599），開兩個 Electron 視窗自動連線到同一個房間：
// 看得到彼此與人數、走路時對方看到平滑的移動與動畫、瞬移的座標被伺服器拒絕並拉回、換地圖後不再顯示、
// 關掉一個視窗後另一邊移除該玩家、伺服器停止時顯示離線且遊戲不卡住、伺服器重啟後按「重新連線」能再加入。
// 用法：pnpm build && node e2e/multiplayer.e2e.mjs
/* global window, requestAnimationFrame */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { _electron as electron } from 'playwright';
import { appEnv, focusGame, tempSaveDir } from './lib.mjs';

const PORT = 2599;
const SERVER = `ws://localhost:${PORT}`;
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

function startServer() {
  const child = spawn(process.execPath, ['dist-server/server.mjs'], { env: { ...process.env, GAME_SERVER_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return child;
}

async function waitForHealth(timeoutMs = 10_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return res.json();
    } catch {
      // 還沒啟動
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('遊戲伺服器沒有在時間內啟動');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
}

async function launch(name) {
  const app = await electron.launch({
    args: ['.'],
    env: appEnv({
      MISTWOOD_START_QUERY: `debug=1&play=1&peaceful=1&mp=1&server=${encodeURIComponent(SERVER)}&mpName=${name}`,
      MISTWOOD_SAVE_DIR: tempSaveDir(),
      MISTWOOD_USER_DATA_DIR: tempSaveDir(),
    }),
  });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => console.error(`[${name}] ${err.message}`));
  await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });
  const debug = (fn, arg) => page.evaluate(fn, arg);
  return {
    app,
    page,
    debug,
    net: () => debug(() => window.__mistwoodDebug.net()),
    remotes: () => debug(() => window.__mistwoodDebug.remotePlayers()),
    state: () => debug(() => window.__mistwoodDebug.playerState()),
  };
}

let server = startServer();
let a;
let b;
try {
  await waitForHealth();
  [a, b] = await Promise.all([launch('A'), launch('B')]);

  await check('兩個視窗都連上同一個房間，人數 2、看得到對方', async () => {
    for (const c of [a, b]) {
      await c.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected' && window.__mistwoodDebug.net().playerCount === 2, null, { timeout: 15_000 });
    }
    assert.equal((await a.net()).roomId, (await b.net()).roomId);
    const seen = await b.remotes();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].name, 'A');
    assert.ok(seen[0].visible, '同一張地圖應該要顯示');
    assert.match(await b.page.locator('[data-testid="net-status"]').innerText(), /已連線\s*2 人/);
    const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
    assert.equal(health.players, 2);
  });

  await check('A 站到 B 的前方：B 的畫面上看得到 A 的模型與名牌（截圖 docs/screenshots/phase11/multiplayer_two.png）', async () => {
    const s = await b.state();
    // B 面向 facingYaw，攝影機在 B 的背後；把 A 放在 B 前方 3 m
    const ax = s.x + Math.sin(s.facingYaw) * 3;
    const az = s.z + Math.cos(s.facingYaw) * 3;
    await a.debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [ax, az]);
    await b.page.waitForFunction(([x, z]) => {
      const r = window.__mistwoodDebug.remotePlayers()[0];
      return r && Math.hypot(r.rx - x, r.rz - z) < 0.5;
    }, [ax, az], { timeout: 5000 });
    const label = b.page.locator('[data-testid="remote-name"]');
    await label.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await label.innerText(), 'A');
    mkdirSync('docs/screenshots/phase11', { recursive: true });
    await b.page.screenshot({ path: 'docs/screenshots/phase11/multiplayer_two.png' });
  });

  await check('A 走路時 B 看到 A 平滑地移動，動畫是走或跑', async () => {
    const before = (await b.remotes())[0];
    await focusGame(a.page);
    await a.page.keyboard.down('KeyW');
    // 在 B 的畫面裡每一幀記錄插值後的位置（含時間），不受測試程式來回呼叫的延遲影響
    const samples = await b.debug(
      () =>
        new Promise((resolve) => {
          const out = [];
          const start = performance.now();
          const tick = () => {
            const r = window.__mistwoodDebug.remotePlayers()[0];
            if (r) out.push({ t: performance.now(), rx: r.rx, rz: r.rz, anim: r.anim });
            if (performance.now() - start < 1800) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    await a.page.keyboard.up('KeyW');
    const anims = new Set(samples.map((s) => s.anim));
    const after = (await b.remotes())[0];
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    assert.ok(moved > 2, `B 看到 A 只移動了 ${moved.toFixed(2)} m`);
    assert.ok(anims.has('walk') || anims.has('run'), `動畫 ${[...anims].join(', ')}`);
    // 插值後的位置每一幀都連續：不會一幀跳超過 0.5 m，速度不超過跑步速度的 1.5 倍（6.2 m/s）
    assert.ok(samples.length > 30, `只取到 ${samples.length} 幀`);
    let maxStep = 0;
    let maxSpeed = 0;
    for (let i = 1; i < samples.length; i++) {
      const step = Math.hypot(samples[i].rx - samples[i - 1].rx, samples[i].rz - samples[i - 1].rz);
      maxStep = Math.max(maxStep, step);
      if (samples[i].t - samples[i - 1].t > 5) maxSpeed = Math.max(maxSpeed, step / ((samples[i].t - samples[i - 1].t) / 1000));
    }
    assert.ok(maxStep < 0.5, `插值位置一幀跳了 ${maxStep.toFixed(2)} m`);
    assert.ok(maxSpeed < 9.3, `插值速度最高 ${maxSpeed.toFixed(1)} m/s`);
    // A 本機與 B 看到的位置一致（伺服器採用了 A 的移動）
    await b.page.waitForTimeout(400);
    const local = await a.state();
    const seen = (await b.remotes())[0];
    assert.ok(Math.hypot(local.x - seen.x, local.z - seen.z) < 0.5, `A 本機 (${local.x.toFixed(1)}, ${local.z.toFixed(1)})，B 看到 (${seen.x.toFixed(1)}, ${seen.z.toFixed(1)})`);
  });

  await check('A 送出瞬移的座標：伺服器不採用、B 看到的 A 不跳、A 被拉回', async () => {
    const local = await a.state();
    const before = await a.net();
    const sent = await a.debug(([x, y, z]) => window.__mistwoodDebug.netSendRaw('move', { t: performance.now(), x: x + 60, y, z, yaw: 0, anim: 'run' }), [local.x, local.y, local.z]);
    assert.ok(sent);
    await a.page.waitForFunction((n) => window.__mistwoodDebug.net().corrections > n, before.corrections, { timeout: 3000 });
    assert.equal((await a.net()).lastCorrection, 'speed');
    await b.page.waitForTimeout(300);
    const seen = (await b.remotes())[0];
    assert.ok(Math.abs(seen.x - local.x) < 2, `B 看到 A 在 x=${seen.x.toFixed(1)}（原本 ${local.x.toFixed(1)}）`);
    await a.page.waitForTimeout(300);
    const after = await a.state();
    assert.ok(Math.hypot(after.x - local.x, after.z - local.z) < 2, 'A 應該在原位');
  });

  await check('格式不對的訊息被忽略，A 仍然連線', async () => {
    await a.debug(() => window.__mistwoodDebug.netSendRaw('move', { x: 'NaN', hp: 999 }));
    await a.debug(() => window.__mistwoodDebug.netSendRaw('attack', { damage: 9999 }));
    await a.page.waitForTimeout(500);
    assert.equal((await a.net()).status, 'connected');
    assert.equal((await b.net()).playerCount, 2);
  });

  await check('A 走過地圖出入口到螢苔祕林：伺服器接受瞬移，B 不再顯示 A', async () => {
    const before = (await a.net()).corrections;
    await a.debug(() => window.__mistwoodDebug.travelToMap('glowmoss'));
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.map === 'glowmoss', null, { timeout: 5000 });
    const seen = (await b.remotes())[0];
    assert.equal(seen.visible, false);
    await a.page.waitForTimeout(500);
    assert.equal((await a.net()).corrections, before, `換地圖不應該被修正（${(await a.net()).lastCorrection}）`);
  });

  await check('關掉 A 的視窗：B 移除 A、人數 1、顯示離開的通知', async () => {
    await a.app.close();
    a = null;
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers().length === 0 && window.__mistwoodDebug.net().playerCount === 1, null, { timeout: 10_000 });
    const toasts = await b.debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
    assert.ok(toasts.includes('net.left'), `通知 ${toasts.join(', ')}`);
  });

  await check('伺服器停止：B 顯示離線與「重新連線」，遊戲沒有卡住', async () => {
    await stopServer(server);
    await b.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'error', null, { timeout: 15_000 });
    await b.page.locator('[data-testid="net-reconnect"]').waitFor({ timeout: 3000 });
    assert.match(await b.page.locator('[data-testid="net-status"]').innerText(), /離線/);
    // 還能走動
    const before = await b.state();
    await focusGame(b.page);
    await b.page.keyboard.down('KeyD');
    await b.page.waitForTimeout(600);
    await b.page.keyboard.up('KeyD');
    const after = await b.state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5, '斷線後應該還能走動');
  });

  await check('伺服器重新啟動後按「重新連線」能再加入', async () => {
    server = startServer();
    await waitForHealth();
    await b.page.locator('[data-testid="net-reconnect"]').click();
    await b.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected', null, { timeout: 10_000 });
    assert.equal((await b.net()).playerCount, 1);
    assert.equal(await b.page.locator('[data-testid="net-reconnect"]').count(), 0);
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await Promise.all([a?.app.close(), b?.app.close()].filter(Boolean));
  await stopServer(server);
}

console.log(`multiplayer e2e\n${results.join('\n')}`);
if (failed) process.exitCode = 1;
