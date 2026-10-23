// 端對端：任務 6C — 近戰（GAME_DESIGN 5.3）：預設裝備單手劍；1 / 2 / 3 切換徒手 / 短刀 / 單手劍（手上顯示的武器跟著換）；
// 三種武器的輕擊連段（拳 → 拳 → 踢、刺 → 切 → 雙刃刺、斜斬 → 橫斬 → 劈斬）與右鍵重擊都會實際扣血，傷害等於資料；
// 播放的是招式的動畫片段；重擊有冷卻；裝備寫入存檔。拖尾與衝擊的外觀以截圖檢查（--melee）。
// 用法：pnpm build && node e2e/melee.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, tempSaveDir } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const weapons = JSON.parse(readFileSync('src/data/weapons.json', 'utf8'));
const saveDir = tempSaveDir();
const KEY = { fist: 'Digit1', knife: 'Digit2', sword: 'Digit3' };

await runE2e('melee e2e', { query: 'debug=1&play=1&peaceful=1', env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug }) => {
  const melee = () => debug(() => window.__mistwoodDebug.melee());
  // 只看霧林邊緣的迷霧噗啾（任務 7C 之後地圖其他地方也有怪物）
  const forestSpawners = spawners.filter((sp) => sp.regionId === 'forest' && sp.enemy === 'mist_wisp').map((sp) => sp.id);
  const enemies = () => debug((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))), forestSpawners);
  const [sx, sz] = spawners[0].center;

  /** 站到血量足夠的迷霧噗啾旁邊、面向牠（不等待，連段才接得上） */
  const standNextTo = async (minHp) => {
    // 優先選還沒被打過的（剛被打中的還在被擊退、會滑走）
    const list = (await enemies()).filter((e) => e.hp >= minHp).sort((a, b) => b.hp - a.hp);
    assert.ok(list.length > 0, `沒有血量 ≥ ${minHp} 的迷霧噗啾：${JSON.stringify(await enemies())}`);
    const e = list[0];
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x - 1.1, z), [e.x, e.z]);
    // 傳送在下一幀才生效；之後再面向目標（face 以目前位置計算方向）
    await page.waitForTimeout(50);
    const now = (await enemies()).find((n) => n.id === e.id) ?? e;
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [now.x, now.z]);
    return now;
  };

  /** 出一招並檢查：播放招式動畫、命中後扣的血等於招式傷害 */
  const strike = async (code, move) => {
    // 劍的寬扇形會同時打到旁邊的敵人：選血量最高的；血量不夠一招時，命中後應被擊敗
    const target = await standNextTo(1);
    await debug((c) => window.__mistwoodDebug.tap(c), code);
    // 前一招還沒結束時這一下會先排隊（先行輸入），等這一招的動畫真的開始再計時
    await page
      .waitForFunction((clip) => window.__mistwoodDebug.melee().actionClip === clip, move.clip, { timeout: 1500 })
      .catch(() => {});
    const m = await melee();
    assert.equal(m.actionClip, move.clip, `${move.id} 的動畫應為 ${move.clip}，實際 ${m.actionClip}`);
    await page.waitForTimeout(move.hitDelay * 1000 + 160);
    const after = (await enemies()).find((e) => e.id === target.id);
    const p = await debug(() => window.__mistwoodDebug.playerState());
    const where = `玩家 (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) 面向 ${p.facingYaw.toFixed(2)}；目標 出手前 (${target.x.toFixed(2)}, ${target.z.toFixed(2)}) 之後 (${after?.x.toFixed(2)}, ${after?.z.toFixed(2)})`;
    if (target.hp > move.damage) assert.equal(after?.hp, target.hp - move.damage, `${move.id}：${target.hp} → ${after?.hp}（傷害應為 ${move.damage}）${where}`);
    else assert.equal(after, undefined, `${move.id}：血量 ${target.hp} ≤ 傷害 ${move.damage}，應被擊敗 ${where}`);
  };

  await check('預設裝備單手劍，手上顯示的也是劍；HUD 標示目前武器', async () => {
    await debug(([x, z]) => window.__mistwoodDebug.teleport(x - 6, z + 6), [sx, sz]);
    await page.waitForFunction((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))).length >= 4, forestSpawners, { timeout: 30_000 });
    const m = await melee();
    assert.equal(m.weapon, 'sword');
    assert.equal(m.shown, 'sword');
    assert.equal(await page.locator('[data-testid="weapon-selector"]').getAttribute('data-weapon'), 'sword');
  });

  // 旅人（預設職業）的三把武器；其他職業的武器由 classes 的單元測試檢查資料
  for (const w of weapons.filter((x) => x.id in KEY)) {
    await check(`按 ${KEY[w.id].slice(5)} 切換成${w.id}：裝備與手上的武器一起換`, async () => {
      await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
      // 每種武器用一批新的迷霧噗啾（被打過的不會回血、補充要等生成點冷卻）；重設世界會回到預設的單手劍
      await debug(() => window.__mistwoodDebug.resetWorld());
      await page.waitForFunction((ids) => window.__mistwoodDebug.enemies().filter((e) => ids.some((id) => e.id.startsWith(`${id}#`))).filter((e) => e.hp === 60).length >= 4, forestSpawners, { timeout: 30_000 });
      if (w.id !== 'sword') assert.equal((await melee()).weapon, 'sword');
      await page.keyboard.press(KEY[w.id]);
      await page.waitForTimeout(200);
      const m = await melee();
      assert.equal(m.weapon, w.id);
      assert.equal(m.shown, w.id);
      assert.equal(await page.locator('[data-testid="weapon-selector"]').getAttribute('data-weapon'), w.id);
    });

    await check(`${w.id} 輕擊連段（${w.light.map((m) => m.id).join(' → ')}）每一招都扣血、傷害等於資料`, async () => {
      for (const move of w.light) await strike('Mouse0', move);
      // 連段計數到最後一招
      assert.ok((await melee()).comboCount === w.light.length, `comboCount=${(await melee()).comboCount}`);
    });

    await check(`${w.id} 右鍵重擊（${w.heavy.id}）扣血；冷卻中再按不會出招`, async () => {
      await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
      await strike('Mouse2', w.heavy);
      assert.ok((await melee()).heavyCooldown > 0);
      await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
      const before = await melee();
      if (before.heavyCooldown > 0.3) {
        await debug(() => window.__mistwoodDebug.tap('Mouse2'));
        await page.waitForTimeout(60);
        assert.equal((await melee()).actionClip, null, '冷卻中不應出招');
      }
      await page.waitForTimeout(w.heavy.cooldown * 1000);
    });
  }

  await check('短刀與劍的揮砍會留下拖尾，徒手沒有', async () => {
    await page.keyboard.press('Digit3');
    await page.waitForTimeout(200);
    await standNextTo(1);
    await debug(() => window.__mistwoodDebug.tap('Mouse0'));
    await page.waitForTimeout(180);
    assert.ok((await melee()).trail > 2, '劍沒有拖尾');
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(200);
    await debug(() => window.__mistwoodDebug.tap('Mouse0'));
    await page.waitForTimeout(180);
    assert.equal((await melee()).trail, 0, '徒手不應有拖尾');
  });

  await check('換成短刀後存檔：裝備寫入存檔', async () => {
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 3000 });
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(200);
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.deepEqual(file.loadout, { weapon: 'knife', heroClass: 'traveler', equipment: {} });
  });
});

// 重開遊戲「繼續遊戲」：裝備還是短刀
await runE2e('melee e2e（重開）', { query: 'debug=1', env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug }) => {
  await check('重開後繼續遊戲：仍裝備短刀、手上是短刀', async () => {
    await page.locator('[data-testid="title-continue"]').click();
    await page.locator('[data-testid="title-continue"]').waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(800);
    const m = await debug(() => window.__mistwoodDebug.melee());
    assert.equal(m.weapon, 'knife');
    assert.equal(m.shown, 'knife');
  });
});
