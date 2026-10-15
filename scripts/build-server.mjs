// 以 esbuild 打包遊戲伺服器（server/ + 共用的 src/game-core、src/data）→ dist-server/server.mjs。
// node_modules 的套件不打包（部署時照常安裝依賴）；@/ 別名指向 src。
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';

const options = {
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) },
  sourcemap: true,
  logLevel: 'info',
};

export async function buildServer() {
  await build(options);
}

/** 開發用：檔案變動時重新打包，每次完成後呼叫 onRebuild */
export async function watchServer(onRebuild) {
  const ctx = await context({
    ...options,
    plugins: [{ name: 'on-rebuild', setup: (b) => b.onEnd((result) => result.errors.length === 0 && onRebuild()) }],
  });
  await ctx.watch();
  return ctx;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildServer();
}
