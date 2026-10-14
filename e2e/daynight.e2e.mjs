// 端對端：任務 6B — 日夜與日月光照（GAME_DESIGN 5.2）：新遊戲從 08:00 開始、時鐘隨遊玩前進；
// 夜晚方向光換成月亮、畫面變暗但仍看得清楚；室內不受日夜影響；茉莉可以讓玩家睡到早上；
// 存檔記錄的遊玩秒數換算回同一個時刻。天空、星星、螢火蟲的外觀以截圖檢查（--daynight）。
// 用法：pnpm build && node e2e/daynight.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { clockAt } from '../src/game-core/world/timeOfDay.ts';
import { runE2e, tempSaveDir } from './lib.mjs';

const saveDir = tempSaveDir();
const interior = JSON.parse(readFileSync('src/data/interiors.json', 'utf8'))[0];

/** 畫面平均亮度（HSV 的 V）與藍色比例 */
const lookOf = (page) =>
  page.evaluate(() => {
    const src = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let val = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      val += max / 255;
      blue += data[i + 2] / (data[i] + data[i + 1] + data[i + 2] + 1);
    }
    const n = data.length / 4;
    return { val: val / n, blue: blue / n };
  });

/** 兩個時刻的差（小時，考慮跨午夜） */
const hourDiff = (a, b) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};

await runE2e(
  'daynight e2e',
  { query: 'debug=1&play=1&peaceful=1', env: { MISTWOOD_SAVE_DIR: saveDir } },
  async ({ page, check, debug, camera, teleport }) => {
    const clock = () => debug(() => window.__mistwoodDebug.clock());
    const setClock = (h) => debug((v) => window.__mistwoodDebug.setClock(v), h);
    const viewMeadow = async () => {
      await teleport(4, 30, 400);
      await debug(() => window.__mistwoodDebug.face(0, 0));
      await camera({ yaw: 0, pitch: 0.3, distance: 7 });
      await page.waitForTimeout(900);
    };

    await check('新遊戲從早上 8 點開始，方向光是太陽', async () => {
      const c = await clock();
      assert.ok(hourDiff(c.hour, 8) < 0.2, `hour=${c.hour}`);
      assert.equal(c.moonLight, false);
      assert.equal(c.phase, 'day');
    });

    await check('時鐘隨遊玩前進（約 1 秒 = 0.81 遊戲分鐘），而且平滑', async () => {
      const a = await clock();
      await page.waitForTimeout(4000);
      const b = await clock();
      const dt = b.time - a.time;
      assert.ok(dt > 3 && dt < 5.5, `經過 ${dt} 秒`);
      assert.ok(b.hour > a.hour && b.hour - a.hour < 0.1, `${a.hour} → ${b.hour}`);
    });

    let day;
    await check('正午：畫面明亮', async () => {
      await setClock(12);
      await viewMeadow();
      day = await lookOf(page);
      const c = await clock();
      assert.ok(hourDiff(c.hour, 12) < 0.1, `hour=${c.hour}`);
      assert.ok(c.lightIntensity > 2, `light=${c.lightIntensity}`);
      assert.ok(day.val > 0.55, `亮度 ${day.val.toFixed(3)}`);
    });

    await check('黃昏 18 點：太陽在西方、低空，暖色', async () => {
      await setClock(18);
      await page.waitForTimeout(500);
      const c = await clock();
      assert.equal(c.phase, 'dusk');
      assert.equal(c.moonLight, false);
      assert.ok(c.sun.x < -0.5 && c.sun.elevation > 0 && c.sun.elevation < 0.35, JSON.stringify(c.sun));
    });

    await check('午夜：方向光換成月亮，畫面變暗偏藍，但仍看得清楚', async () => {
      await setClock(0);
      await viewMeadow();
      const c = await clock();
      assert.equal(c.moonLight, true);
      assert.equal(c.phase, 'night');
      assert.ok(c.moon.elevation > 0.6, `moon=${JSON.stringify(c.moon)}`);
      const night = await lookOf(page);
      assert.ok(night.val < day.val * 0.8, `夜晚 ${night.val.toFixed(3)} 不比白天 ${day.val.toFixed(3)} 暗`);
      assert.ok(night.val > 0.2, `夜晚太暗：${night.val.toFixed(3)}`);
      assert.ok(night.blue > day.blue, `夜晚 ${night.blue.toFixed(3)} 沒有比白天 ${day.blue.toFixed(3)} 偏藍`);
      // 音效在第一次按鍵後才啟動（瀏覽器的自動播放限制）
      await page.keyboard.press('ShiftLeft');
      await page.waitForTimeout(400);
      const sound = await debug(() => window.__mistwoodDebug.audio());
      assert.ok(sound.crickets > 0.5 && sound.birds < 0.05, `夜晚應是蟲鳴：${JSON.stringify(sound)}`);
    });

    await check('夜晚進酒館：室內光線與白天相同', async () => {
      const outside = await clock();
      assert.equal(outside.moonLight, true);
      await teleport(-6.4, -30, 600);
      await debug(() => window.__mistwoodDebug.face(-2.5, -30));
      await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'village_tavern_03', null, { timeout: 3000 });
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__mistwoodDebug.location() === 'tavern', null, { timeout: 3000 });
      await page.waitForTimeout(1200);
      const inside = await clock();
      assert.equal(inside.lookHour, 12, `室內使用的時段 ${inside.lookHour}`);
    });

    await check('夜晚和茉莉說話：可以「睡到早上」，醒來是 07:00、體力全滿', async () => {
      await teleport(interior.origin[0] - 3.2, interior.origin[1] - 1.3, 300);
      await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [interior.origin[0] - 3.2, interior.origin[1] - 3.6]);
      await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:molly', null, { timeout: 3000 });
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'greet', null, { timeout: 3000 });
      const options = await page.locator('[data-testid="dialogue-option"]').allInnerTexts();
      const index = options.findIndex((t) => /睡到早上/.test(t));
      assert.ok(index >= 0, `選項：${JSON.stringify(options)}`);
      const before = await clock();
      await page.keyboard.press(`Digit${index + 1}`);
      await page.waitForTimeout(300);
      const after = await clock();
      assert.ok(hourDiff(after.hour, 7) < 0.05, `醒來 ${after.hour}`);
      assert.ok(after.day === before.day + 1 || before.hour < 7, `day ${before.day} → ${after.day}`);
      assert.equal((await debug(() => window.__mistwoodDebug.combatState())).hp, 100);
      await page.keyboard.press('Escape');
    });

    await check('白天和茉莉說話：沒有「睡到早上」', async () => {
      await page.waitForFunction(() => window.__mistwoodDebug.dialogue() === null, null, { timeout: 3000 });
      await setClock(12);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'greet', null, { timeout: 3000 });
      const options = await page.locator('[data-testid="dialogue-option"]').allInnerTexts();
      assert.ok(!options.some((t) => /睡到早上/.test(t)), JSON.stringify(options));
      await page.keyboard.press('Escape');
    });

    await check('村屋窗燈（任務 7N）：白天不亮、夜晚亮起；村屋的材質都加上了窗燈', async () => {
      // 前一項在酒館裡（室內固定是晚上的燈光），先回到戶外
      await teleport(4, 30, 400);
      await setClock(12);
      await page.waitForTimeout(400);
      assert.equal((await debug(() => window.__mistwoodDebug.windowGlow())).glow, 0);
      await setClock(22);
      await page.waitForTimeout(400);
      const night = await debug(() => window.__mistwoodDebug.windowGlow());
      assert.ok(night.glow > 0.9, JSON.stringify(night));
      assert.ok(night.patched > 0 && night.compiled > 0, JSON.stringify(night));
    });

    await check('存檔的遊玩秒數換算回同一個時刻（讀檔後時段一致）', async () => {
      await setClock(21.5);
      assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
      const now = await clock();
      const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
      assert.ok(hourDiff(clockAt(file.world.time), now.hour) < 0.05, `存檔 ${clockAt(file.world.time)}，目前 ${now.hour}`);
    });
  },
);
