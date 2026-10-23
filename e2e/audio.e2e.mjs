// 端對端：任務 5A — 音效與音樂：使用者操作後 AudioContext 啟動、腳步聲依地面、事件音效、
// 音樂在暫停時停止、迷霧時鳥叫消失、音量設定存檔。（聽不到聲音，以播放紀錄與音訊節點狀態驗證）
// 用法：pnpm build && node e2e/audio.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { placements, runE2e, standSouthOf, tempSaveDir } from './lib.mjs';

const env = { MISTWOOD_SAVE_DIR: tempSaveDir(), MISTWOOD_USER_DATA_DIR: tempSaveDir() };
const tree = placements.find((p) => p.id === 'meadow_tree_001');
const chest = placements.find((p) => p.prefabId === 'chest_wood');

await runE2e('audio e2e（1/2）', { env }, async ({ page, check, debug, camera, teleport, teleportOnto }) => {
  const audioState = () => debug(() => window.__mistwoodDebug.audio());
  const played = async (id) => (await audioState()).played[id] ?? 0;
  const walk = async (ms) => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
  };

  await check('按鍵後 AudioContext 啟動，遊玩中播放音樂', async () => {
    await page.keyboard.press('ShiftLeft');
    await page.waitForTimeout(500);
    const a = await audioState();
    assert.equal(a.state, 'running');
    assert.equal(a.music, true);
  });

  await check('在草地上走路：草地腳步聲，跑步比走路密', async () => {
    await camera({ yaw: 0, pitch: 0.35, distance: 6 });
    const before = await played('step_grass');
    await walk(2000);
    const walked = (await played('step_grass')) - before;
    assert.ok(walked >= 3 && walked <= 5, `走 2 秒 ${walked} 步`);
    await page.keyboard.down('ShiftLeft');
    const before2 = await played('step_grass');
    await walk(2000);
    await page.keyboard.up('ShiftLeft');
    assert.ok((await played('step_grass')) - before2 > walked, '跑步沒有比較密');
  });

  await check('走在木橋上：木頭腳步聲', async () => {
    await teleportOnto(19.5, 8, 0.45);
    await camera({ yaw: -Math.PI / 2, pitch: 0.35, distance: 6 });
    const before = await played('step_wood');
    await walk(1200);
    assert.ok((await played('step_wood')) - before >= 2);
  });

  await check('砍樹、開寶箱、接任務都有對應的音效', async () => {
    await teleport(...standSouthOf(tree, 1.5));
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.ok((await played('chop')) >= 1);
    await teleport(chest.position[0] + 0.5, chest.position[2] + 1.4);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.ok((await played('chest')) >= 1);
    await page.keyboard.press('KeyE');
    await debug(() => window.__mistwoodDebug.send({ type: 'AcceptQuest', quest: 'wood_for_bridge' }));
    assert.ok((await played('quest_accept')) >= 1);
  });

  await check('晴朗時有鳥叫，迷霧時鳥叫消失', async () => {
    // 鳥叫的音量乘上 1 - 夜晚，所以要在白天測（共享世界時鐘在夜裡會失準）
    await debug(() => window.__mistwoodDebug.setClock(12));
    await page.waitForTimeout(300);
    assert.ok((await audioState()).birds > 0.5);
    await debug(() => window.__mistwoodDebug.setMist(1));
    await page.waitForTimeout(300);
    assert.ok((await audioState()).birds < 0.05);
    await debug(() => window.__mistwoodDebug.setMist(null));
  });

  await check('暫停時音樂停止，繼續後恢復', async () => {
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.waitForTimeout(200);
    assert.equal((await audioState()).music, false);
    await debug(() => window.__mistwoodDebug.flow('resume'));
    await page.waitForTimeout(200);
    assert.equal((await audioState()).music, true);
  });

  await check('設定畫面調整音量並存檔', async () => {
    await debug(() => window.__mistwoodDebug.flow('pause'));
    await page.locator('[data-testid="pause-settings"]').click();
    await page.locator('[data-testid="volume-music"]').fill('0.2');
    await page.locator('[data-testid="settings-close"]').click();
    assert.equal((await debug(() => window.__mistwoodDebug.settings())).volumes.music, 0.2);
  });
});

await runE2e('audio e2e（2/2 重開）', { query: 'debug=1', env }, async ({ check, debug }) => {
  await check('重開後音量設定保留', async () => {
    assert.equal((await debug(() => window.__mistwoodDebug.settings())).volumes.music, 0.2);
  });
});
