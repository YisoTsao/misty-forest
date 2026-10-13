// 以 esbuild 編譯 Electron 主程序與 preload。
// main 為 ESM；preload 在 sandbox 下必須為 CommonJS。
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

export async function buildElectron() {
  await Promise.all([
    build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js', format: 'esm' }),
    build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs' }),
  ]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildElectron();
}
