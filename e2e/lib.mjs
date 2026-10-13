// 端對端測試共用：啟動 Electron 正式版、逐項檢查並彙整結果、常用除錯 API 包裝。
/* global window */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

export const prefabs = new Map(JSON.parse(readFileSync('src/data/prefabs.json', 'utf8')).map((p) => [p.id, p]));
export const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));

/** 每次啟動使用獨立的暫存存檔資料夾，測試不會讀到或覆蓋玩家的真實存檔 */
export function tempSaveDir() {
  return mkdtempSync(path.join(tmpdir(), 'mistwood-e2e-'));
}

/**
 * 啟動遊戲並執行 body(t)。t 提供 page、check（單項檢查，失敗不中斷）與常用操作。
 * 結束時印出結果；任何一項失敗則以 exit code 1 結束。
 */
export async function runE2e(title, { query = 'debug=1&play=1', env = {} } = {}, body) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, MISTWOOD_START_QUERY: query, MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir(), ...env },
  });
  const results = [];
  let failed = false;
  const check = async (name, fn) => {
    try {
      await fn();
      results.push(`  ✓ ${name}`);
    } catch (err) {
      failed = true;
      results.push(`  ✗ ${name}\n      ${err.message.split('\n').join('\n      ')}`);
    }
  };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (err) => console.error(`[renderer] ${err.message}`));
    await page.waitForFunction(() => window.__mistwoodDebug?.isReady() === true, null, { timeout: 60_000 });
    await page.bringToFront();
    await page.locator('canvas').focus().catch(() => {});
    const debug = (fn, arg) => page.evaluate(fn, arg);
    const t = {
      app,
      page,
      check,
      debug,
      state: () => debug(() => window.__mistwoodDebug.playerState()),
      camera: (set) => debug((s) => window.__mistwoodDebug.camera(s), set),
      teleport: async (x, z, settleMs = 700) => {
        await debug(([tx, tz]) => window.__mistwoodDebug.teleport(tx, tz), [x, z]);
        await page.waitForTimeout(settleMs); // 落地、碰撞體更新
      },
      objectState: (id) => debug((pid) => window.__mistwoodDebug.objectState(pid), id),
      itemCount: (id) => debug((iid) => window.__mistwoodDebug.itemCount(iid), id),
      interactTarget: () => debug(() => window.__mistwoodDebug.interactTarget()),
    };
    await page.waitForTimeout(800);
    await body(t);
  } catch (err) {
    failed = true;
    results.push(`  ✗ 執行失敗：${err.message}`);
  } finally {
    await app.close();
  }
  console.log(`${title}\n${results.join('\n')}`);
  if (failed) process.exitCode = 1;
  return !failed;
}

/** 面向 -Z（出生時的朝向）站在物件南側 distance 公尺處的位置 */
export function standSouthOf(placement, distance) {
  return [placement.position[0], placement.position[2] + distance];
}
