// 端對端：任務 11A / 11B / 11C — 多人連線（Colyseus）。
// 啟動建置好的遊戲伺服器（dist-server，埠 2599），開兩個 Electron 視窗自動連線到同一個房間：
// 看得到彼此與人數、走路時對方看到平滑的移動與動畫、瞬移的座標被伺服器拒絕並拉回、換地圖後不再顯示、
// 關掉一個視窗後另一邊移除該玩家。
// 斷線續玩（11C）：A 經過一個 TCP 代理（埠 2597）連伺服器，代理可以把連線剪斷一段時間、或加上隨機延遲：
// 網路中斷 5 秒後 A 自動重連回同一個座位（B 看到的是同一個人，不是離開再加入）；網路抖動時 B 的呈現延遲自動拉長；
// 伺服器重啟後 B 不必按按鈕就自動重新加入。
// 用法：pnpm build && node e2e/multiplayer.e2e.mjs
/* global window, requestAnimationFrame */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { _electron as electron } from 'playwright';
import { appEnv, focusGame, tempSaveDir } from './lib.mjs';

const serverLog = [];
const clientLog = [];
const PORT = 2599;
const PROXY_PORT = 2597;
const SERVER = `ws://localhost:${PORT}`;
const VIA_PROXY = `ws://localhost:${PROXY_PORT}`;
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
  // 用正式部署的來源設定（任務 11D）：只允許 Vercel 的網址與 Electron（file:// 頁面的 Origin 是 null 或 file://）
  const env = { ...process.env, GAME_SERVER_PORT: String(PORT), ALLOWED_ORIGINS: 'https://mistwood.vercel.app,null,file://' };
  const child = spawn(process.execPath, ['dist-server/server.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  // 加入 / 斷線 / 重新連線 / 離開的紀錄（失敗時對照用）
  child.stdout.on('data', (d) => {
    for (const line of String(d).split('\n')) if (/\[world\]/.test(line) && !/忽略/.test(line)) serverLog.push(line.trim());
  });
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

/**
 * TCP 代理：模擬玩家那一端的網路。cut() 把現有連線直接切斷（不送 WebSocket 關閉訊框，兩端都看到異常斷線）、
 * 並拒絕新的連線，restore() 恢復；jitter(ms) 讓每一段資料隨機延遲 0..ms（保持順序）。
 */
function startProxy(listenPort, targetPort) {
  const sockets = new Set();
  let blocked = false;
  let jitterMs = 0;
  /** 同一個方向依序送出：每一段排在前一段之後、再加上隨機延遲 */
  const pipe = (from, to) => {
    let readyAt = 0;
    from.on('data', (chunk) => {
      if (!jitterMs) return to.write(chunk);
      readyAt = Math.max(readyAt, Date.now()) + Math.random() * jitterMs * 0.5;
      const at = Math.max(readyAt, Date.now() + Math.random() * jitterMs);
      readyAt = at;
      setTimeout(() => !to.destroyed && to.write(chunk), at - Date.now());
    });
  };
  const server = net.createServer((client) => {
    if (blocked) return client.destroy();
    const upstream = net.connect(targetPort, '127.0.0.1');
    sockets.add(client);
    sockets.add(upstream);
    const close = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    for (const s of [client, upstream]) {
      s.on('error', close);
      s.on('close', close);
    }
    pipe(client, upstream);
    pipe(upstream, client);
  });
  server.listen(listenPort);
  return {
    cut() {
      blocked = true;
      for (const s of sockets) s.destroy();
    },
    restore() {
      blocked = false;
    },
    jitter(ms) {
      jitterMs = ms;
    },
    close() {
      server.close();
      for (const s of sockets) s.destroy();
    },
  };
}

async function launch(name, url = SERVER) {
  const app = await electron.launch({
    args: ['.'],
    env: appEnv({
      MISTWOOD_START_QUERY: `debug=1&play=1&peaceful=1&mp=1&server=${encodeURIComponent(url)}&mpName=${name}`,
      MISTWOOD_SAVE_DIR: tempSaveDir(),
      MISTWOOD_USER_DATA_DIR: tempSaveDir(),
    }),
  });
  const page = await app.firstWindow();
  page.on('pageerror', (err) => console.error(`[${name}] ${err.message}`));
  page.on('console', (msg) => {
    if (/\[net\]|reconnection/.test(msg.text())) clientLog.push(`[${name}] ${msg.text()}`);
  });
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
const proxy = startProxy(PROXY_PORT, PORT);
let a;
let b;
const toastKeys = async (c) => c.debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
const count = (keys, key) => keys.filter((k) => k === key).length;
try {
  await waitForHealth();
  [a, b] = await Promise.all([launch('A', VIA_PROXY), launch('B')]);

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

  await check('A 換短刀並出招：B 看到 A 手上拿短刀、播放同一招的動畫（任務 11E）', async () => {
    await a.debug(() => window.__mistwoodDebug.equip('knife'));
    await b.page.waitForFunction(() => {
      const r = window.__mistwoodDebug.remotePlayers()[0];
      return r?.weapon === 'knife' && r.held === 'knife';
    }, null, { timeout: 5000 });
    await a.debug(() => window.__mistwoodDebug.tap('Mouse0'));
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.clip === '1H_Melee_Attack_Stab', null, { timeout: 3000 });
    // 招式結束後回到待機動畫
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.clip !== '1H_Melee_Attack_Stab', null, { timeout: 3000 });
    const net = await b.net();
    assert.ok(net.actionsPlayed >= 1, `B 播放的動作數 ${net.actionsPlayed}`);
  });

  await check('A 施放星屑飛彈：B 看到 A 拿魔杖、飛彈從 A 身上射出，但不會打到 B 那邊的怪物（截圖 multiplayer_spell.png）', async () => {
    await a.debug(() => window.__mistwoodDebug.setMp(100));
    const hitsBefore = (await b.debug(() => window.__mistwoodDebug.magic())).hits;
    await a.debug(() => window.__mistwoodDebug.tap('KeyF'));
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.held === 'wand', null, { timeout: 3000 });
    await b.page.waitForFunction(() => window.__mistwoodDebug.magic().projectiles > 0, null, { timeout: 3000 });
    await b.page.screenshot({ path: 'docs/screenshots/phase11/multiplayer_spell.png' });
    const magic = await b.debug(() => window.__mistwoodDebug.magic());
    assert.equal(magic.casts, 0, 'B 自己沒有施法');
    assert.equal(magic.hits, hitsBefore, '其他玩家的飛彈只是表現');
    // 施法結束後換回短刀
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.held === 'knife', null, { timeout: 3000 });
  });

  const chat = (c) => c.debug(() => window.__mistwoodDebug.chat());
  /** 用鍵盤打開聊天、打字、按 Enter 送出（真的走輸入列，不呼叫除錯函式） */
  const say = async (c, text) => {
    await focusGame(c.page);
    await c.page.keyboard.press('Enter');
    await c.page.waitForFunction(() => window.document.activeElement?.getAttribute('data-testid') === 'chat-input', null, { timeout: 3000 });
    await c.page.keyboard.type(text);
    await c.page.keyboard.press('Enter');
    await c.page.waitForFunction(() => window.__mistwoodDebug.chat().open === false, null, { timeout: 3000 });
  };
  const heard = (c, text, channel) =>
    c.page.waitForFunction(([t, ch]) => window.__mistwoodDebug.chat().lines.some((l) => l.text === t && l.channel === ch), [text, channel], { timeout: 5000 });

  await check('A 按 Enter 說話：B 收到附近頻道的訊息、A 頭上出現對話泡泡（截圖 chat.png）（任務 11F）', async () => {
    const aId = (await a.net()).sessionId;
    await say(a, '大家好，我是 A 😀');
    await heard(b, '大家好，我是 A 😀', 'say');
    const line = (await chat(b)).lines.find((l) => l.text === '大家好，我是 A 😀');
    assert.equal(line.name, 'A');
    assert.ok((await chat(b)).bubbles.some((x) => x.sessionId === aId), 'B 的畫面上 A 有泡泡');
    const bubble = b.page.locator('[data-testid="chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await bubble.innerText(), '大家好，我是 A 😀');
    await b.page.locator('[data-testid="chat-log"]').waitFor({ state: 'visible', timeout: 3000 });
    await b.page.screenshot({ path: 'docs/screenshots/phase11/chat.png' });
    // 自己也看得到自己的泡泡與紀錄
    await heard(a, '大家好，我是 A 😀', 'say');
    await a.page.locator('[data-testid="chat-bubble-self"]').waitFor({ state: 'visible', timeout: 3000 });
  });

  await check('B 打字時角色不動、不施法、不換武器；Esc 只關聊天、不開暫停選單，之後可以繼續操作', async () => {
    const before = await b.state();
    const castsBefore = (await b.debug(() => window.__mistwoodDebug.magic())).casts;
    await focusGame(b.page);
    await b.page.keyboard.press('Enter');
    await b.page.waitForFunction(() => window.document.activeElement?.getAttribute('data-testid') === 'chat-input', null, { timeout: 3000 });
    await b.page.keyboard.type('wasd qfc 123 e x');
    await b.page.keyboard.down('KeyW');
    await b.page.waitForTimeout(400);
    await b.page.keyboard.up('KeyW');
    assert.equal(await b.page.inputValue('[data-testid="chat-input"]'), 'wasd qfc 123 e xw');
    const after = await b.state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 0.05, `B 移動了 ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
    assert.equal((await b.debug(() => window.__mistwoodDebug.magic())).casts, castsBefore, 'B 沒有施法');
    await b.page.keyboard.press('Escape');
    await b.page.waitForFunction(() => window.__mistwoodDebug.chat().open === false, null, { timeout: 3000 });
    await b.page.waitForTimeout(300);
    assert.equal(await b.page.locator('[data-testid="pause-menu"]').count(), 0, 'Esc 不開暫停選單');
    assert.ok(!(await chat(a)).lines.some((l) => l.text?.startsWith('wasd')), '取消的訊息沒有送出');
    // 關掉聊天後可以照常走路
    await focusGame(b.page);
    await b.page.keyboard.down('KeyW');
    await b.page.waitForTimeout(500);
    await b.page.keyboard.up('KeyW');
    const moved = await b.state();
    assert.ok(Math.hypot(moved.x - after.x, moved.z - after.z) > 0.5, 'B 關掉聊天後可以走路');
  });

  await check('附近頻道 30 m 外聽不到；/g 全服所有人收到；/w 密語只有對方收到', async () => {
    const home = await a.state();
    const s = await b.state();
    await a.debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [s.x + 60, s.z]);
    await b.page.waitForFunction((x) => Math.abs(window.__mistwoodDebug.remotePlayers()[0]?.x - x) < 1, s.x + 60, { timeout: 5000 });
    await say(b, '/s 遠方的人聽得到嗎');
    await heard(b, '遠方的人聽得到嗎', 'say');
    await a.page.waitForTimeout(500);
    assert.ok(!(await chat(a)).lines.some((l) => l.text === '遠方的人聽得到嗎'), 'A 在 60 m 外聽不到附近頻道');
    await b.page.waitForTimeout(600);
    await say(b, '/g 全服測試');
    await heard(a, '全服測試', 'global');
    await b.page.waitForTimeout(600);
    await say(b, '/w A 悄悄話');
    await heard(a, '悄悄話', 'whisper');
    // 回顯與對方收到的是兩條獨立的連線，等 B 的紀錄出現再讀（不能假設同時到）
    await heard(b, '悄悄話', 'whisper');
    const echo = (await chat(b)).lines.find((l) => l.text === '悄悄話');
    assert.equal(echo.to, 'A', 'B 看到「你對 A 說」的回顯');
    await a.debug(([x, z]) => window.__mistwoodDebug.teleport(x, z), [home.x, home.z]);
    await b.page.waitForFunction((x) => Math.abs(window.__mistwoodDebug.remotePlayers()[0]?.x - x) < 1, home.x, { timeout: 5000 });
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
            if (r) out.push({ t: performance.now(), rx: r.rx, rz: r.rz, anim: r.anim, delayMs: r.delayMs });
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
    const fast = samples.map((x, i) => (i && x.t - samples[i - 1].t > 5 ? { i, v: Math.hypot(x.rx - samples[i - 1].rx, x.rz - samples[i - 1].rz) / ((x.t - samples[i - 1].t) / 1000), dt: x.t - samples[i - 1].t, d: x.delayMs } : null)).filter((x) => x && x.v > 9.3);
    assert.ok(maxSpeed < 9.3, `插值速度最高 ${maxSpeed.toFixed(1)} m/s（${samples.length} 幀，超速：${JSON.stringify(fast.map((f) => ({ ...f, v: +f.v.toFixed(1), dt: +f.dt.toFixed(1), d: +f.d.toFixed(0) })))}）`);
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

  await check('A 剛加入 1.5 秒就網路中斷 5 秒：A 顯示重新連線中，B 看到 A 留在原地、名牌標示連線不穩，沒有離開通知', async () => {
    // 剛加入不久就斷線也要自動重連回同一個座位（SDK 預設加入不滿 5 秒就放棄，改成 1 秒）
    await a.debug(() => window.__mistwoodDebug.netReconnect());
    await a.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected', null, { timeout: 10_000 });
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers().length === 1 && window.__mistwoodDebug.net().playerCount === 2, null, { timeout: 10_000 });
    await a.page.waitForTimeout(1500);
    const toastsBefore = await toastKeys(b);
    const sessionBefore = (await a.net()).sessionId;
    proxy.cut();
    await a.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'reconnecting', null, { timeout: 5000 });
    assert.match(await a.page.locator('[data-testid="net-status"]').innerText(), /重新連線中/);
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.online === false, null, { timeout: 5000 });
    const label = b.page.locator('[data-testid="remote-name"]');
    assert.equal(await label.getAttribute('data-online'), 'false');
    assert.match(await label.innerText(), /A\s*（連線不穩）/);
    // A 斷線期間還能走動（單人照常）
    await focusGame(a.page);
    const s0 = await a.state();
    await a.page.keyboard.down('KeyW');
    await a.page.waitForTimeout(700);
    await a.page.keyboard.up('KeyW');
    const s1 = await a.state();
    assert.ok(Math.hypot(s1.x - s0.x, s1.z - s0.z) > 0.5, '斷線中應該還能走動');
    await a.page.waitForTimeout(4000);
    assert.equal((await b.net()).playerCount, 2);
    const toastsAfter = await toastKeys(b);
    assert.ok(count(toastsAfter, 'net.left') <= count(toastsBefore, 'net.left'), `B 的通知 ${toastsAfter.join(', ')}`);
    a.sessionBefore = sessionBefore;
  });

  await check('網路恢復：A 自動重連回同一個座位，B 看到 A 恢復在線且位置跟上，沒有離開 / 加入通知', async () => {
    const toastsBefore = await toastKeys(b);
    proxy.restore();
    await a.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected', null, { timeout: 15_000 });
    assert.equal((await a.net()).sessionId, a.sessionBefore, '應該是同一個 session');
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers()[0]?.online === true, null, { timeout: 5000 });
    // 斷線期間 A 走過的位置，重連後以 warp 送出、伺服器採用
    const local = await a.state();
    await b.page.waitForFunction(([x, z]) => {
      const r = window.__mistwoodDebug.remotePlayers()[0];
      return r && Math.hypot(r.x - x, r.z - z) < 0.5;
    }, [local.x, local.z], { timeout: 5000 });
    assert.equal(await b.page.locator('[data-testid="remote-name"]').innerText(), 'A');
    const toastsAfter = await toastKeys(b);
    assert.ok(count(toastsAfter, 'net.left') <= count(toastsBefore, 'net.left') && count(toastsAfter, 'net.joined') <= count(toastsBefore, 'net.joined'), `B 的通知 ${toastsAfter.join(', ')}`);
    assert.ok((await toastKeys(a)).includes('net.restored'));
    assert.equal((await b.net()).playerCount, 2);
  });

  await check('A 的網路抖動（0–150 ms）：B 的呈現延遲自動拉長，A 走路時 B 看到的移動仍連續', async () => {
    proxy.jitter(150);
    await focusGame(a.page);
    await a.page.keyboard.down('KeyW');
    const samples = await b.debug(
      () =>
        new Promise((resolve) => {
          const out = [];
          const start = performance.now();
          const tick = () => {
            const r = window.__mistwoodDebug.remotePlayers()[0];
            if (r) out.push({ t: performance.now(), rx: r.rx, rz: r.rz, delayMs: r.delayMs });
            if (performance.now() - start < 3000) requestAnimationFrame(tick);
            else resolve(out);
          };
          requestAnimationFrame(tick);
        }),
    );
    await a.page.keyboard.up('KeyW');
    proxy.jitter(0);
    const maxDelay = Math.max(...samples.map((s) => s.delayMs));
    assert.ok(maxDelay > 140 && maxDelay <= 300, `呈現延遲最高 ${maxDelay.toFixed(0)} ms`);
    // 延遲拉長之後（後半段）幾乎每一幀都連續。代理的延遲會排隊累積，偶爾某一包晚到超過呈現延遲（上限 300 ms），
    // 畫面停一下再追上：允許最多一次、不超過 1.2 m 的追趕（T-173）
    const late = samples.slice(Math.floor(samples.length / 2));
    const jumps = [];
    for (let i = 1; i < late.length; i++) {
      const step = Math.hypot(late[i].rx - late[i - 1].rx, late[i].rz - late[i - 1].rz);
      if (step >= 0.5) jumps.push({ step: +step.toFixed(2), delayMs: +late[i].delayMs.toFixed(0) });
    }
    assert.ok(jumps.length <= 1 && jumps.every((j) => j.step < 1.2), `後半段 ${late.length} 幀的跳動：${JSON.stringify(jumps)}`);
    if (jumps.length) console.log(`  （抖動時追趕一次：${JSON.stringify(jumps)}）`);
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
    const closedAt = Date.now();
    await a.app.close();
    a = null;
    // 關閉時主動離開（pagehide）就馬上移除；沒送出去時伺服器保留座位 20 秒後移除
    await b.page.waitForFunction(() => window.__mistwoodDebug.remotePlayers().length === 0 && window.__mistwoodDebug.net().playerCount === 1, null, { timeout: 30_000 });
    console.log(`  （關掉視窗後 ${((Date.now() - closedAt) / 1000).toFixed(1)} 秒移除）`);
    const toasts = await b.debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
    assert.ok(toasts.includes('net.left'), `通知 ${toasts.join(', ')}`);
  });

  await check('伺服器停止：B 顯示重新連線中與喚醒提示，遊戲沒有卡住', async () => {
    await stopServer(server);
    await b.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'reconnecting', null, { timeout: 15_000 });
    assert.match(await b.page.locator('[data-testid="net-status"]').innerText(), /重新連線中/);
    assert.equal(await b.page.locator('[data-testid="net-reconnect"]').count(), 0);
    // 等了 4 秒以上：提示伺服器可能在休眠中醒來（Render 免費方案）
    await b.page.locator('[data-testid="net-wake-hint"]').waitFor({ timeout: 8000 });
    assert.match(await b.page.locator('[data-testid="net-wake-hint"]').innerText(), /休眠/);
    // 還能走動
    const before = await b.state();
    await focusGame(b.page);
    await b.page.keyboard.down('KeyD');
    await b.page.waitForTimeout(600);
    await b.page.keyboard.up('KeyD');
    const after = await b.state();
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.5, '斷線後應該還能走動');
  });

  await check('伺服器重新啟動後：B 不必按按鈕就自動重新加入', async () => {
    server = startServer();
    await waitForHealth();
    // SDK 先試著重連回原本的座位（約 15 秒，房間已經不在），之後自動重新加入新房間
    await b.page.waitForFunction(() => window.__mistwoodDebug.net().status === 'connected', null, { timeout: 45_000 });
    assert.equal((await b.net()).playerCount, 1);
    assert.equal(await b.page.locator('[data-testid="net-reconnect"]').count(), 0);
    assert.ok((await toastKeys(b)).includes('net.restored'));
  });
} catch (err) {
  failed = true;
  results.push(`  ✗ 執行失敗：${err.message}`);
} finally {
  await Promise.all([a?.app.close(), b?.app.close()].filter(Boolean));
  proxy.close();
  await stopServer(server);
}

console.log(`multiplayer e2e\n${results.join('\n')}`);
if (failed) console.log(`伺服器紀錄：\n  ${serverLog.join('\n  ')}\n客戶端紀錄：\n  ${clientLog.join('\n  ')}`);
if (failed) process.exitCode = 1;
