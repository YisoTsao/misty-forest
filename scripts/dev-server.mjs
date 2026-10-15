// 開發用遊戲伺服器：esbuild 監看 server/ 與 src/game-core、src/data，改檔後重新打包並重啟 node。
import { spawn } from 'node:child_process';
import { watchServer } from './build-server.mjs';

let child = null;
let restarting = false;

function start() {
  child = spawn(process.execPath, ['--enable-source-maps', 'dist-server/server.mjs'], { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (!restarting && signal !== 'SIGTERM') console.info(`[dev-server] 伺服器結束（code ${code ?? signal}），改檔後會再啟動`);
  });
}

function restart() {
  if (!child || child.exitCode !== null) return start();
  restarting = true;
  child.once('exit', () => {
    restarting = false;
    start();
  });
  child.kill('SIGTERM');
}

const ctx = await watchServer(restart);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await ctx.dispose();
    child?.kill('SIGTERM');
    process.exit(0);
  });
}
