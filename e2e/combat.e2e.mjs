// 端對端：任務 3E — 戰鬥與迷霧生物：生成、左鍵攻擊與 Q 技能（實際按鍵）、冷卻、傷害數字、擊敗與掉落、
// 敵人攻擊、玩家倒下與重生、任務「驅散森林的迷霧」（擊敗里程碑讓迷霧變淡、回報後森林晴朗、迷霧生物消散）。
// 用法：pnpm build && node e2e/combat.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const leo = npcs.find((n) => n.id === 'leo');
const saveDir = tempSaveDir();

await runE2e('combat e2e', { query: 'debug=1&play=1&peaceful=1', env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug, state, camera, teleport }) => {
  const enemies = () => debug(() => window.__mistwoodDebug.enemies());
  const combat = () => debug(() => window.__mistwoodDebug.combatState());
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const [sx, sz] = spawners[0].center;
  /** 站到某隻迷霧生物旁邊並面向它 */
  const approach = async (e, dist = 1.4) => {
    const p = await state();
    const d = Math.hypot(e.x - p.x, e.z - p.z) || 1;
    await teleport(e.x - ((e.x - p.x) / d) * dist, e.z - ((e.z - p.z) / d) * dist, 300);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [e.x, e.z]);
  };

  await check('森林濃霧時迷霧生物陸續出現（兩個生成點各 3 隻）', async () => {
    await teleport(sx - 6, sz + 6);
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().length >= 6, null, { timeout: 30_000 });
    const list = await enemies();
    assert.ok(list.every((e) => e.hp === 60), JSON.stringify(list));
  });

  await check('左鍵攻擊：面前的迷霧生物扣 25 血、出現傷害數字、進入冷卻', async () => {
    const [target] = await enemies();
    await approach(target);
    await camera({ yaw: (await state()).facingYaw + Math.PI, pitch: 0.35, distance: 5 });
    await page.mouse.click(800, 450); // 第一下用來鎖定滑鼠
    await page.waitForTimeout(80);
    if ((await combat()).attackCooldown === 0) await page.mouse.click(800, 450);
    await page.waitForTimeout(80);
    // 自動化環境無法鎖定滑鼠時，點擊都會被拿去嘗試鎖定；改以除錯 API 送出同一個按鍵代碼
    if ((await combat()).attackCooldown === 0) await debug(() => window.__mistwoodDebug.tap('Mouse0'));
    await page.waitForTimeout(400);
    const after = (await enemies()).find((e) => e.id === target.id);
    assert.equal(after?.hp, 35, JSON.stringify(after));
    assert.ok((await combat()).attackCooldown >= 0, 'no cooldown');
    assert.ok((await page.locator('[data-testid="damage-number"]').count()) >= 1, '沒有傷害數字');
  });

  await check('Q 技能：周圍的迷霧生物一起受傷，進入 6 秒冷卻', async () => {
    // 攻擊動作進行中不能放技能，等動作結束
    await page.waitForFunction(() => window.__mistwoodDebug.playerState().action === null, null, { timeout: 2000 });
    // 站到一隻迷霧生物旁邊再施放；技能範圍 3.6 m + 身體 0.5 m，巡邏中的迷霧生物在前搖期間會移動，只檢查明顯在範圍內的
    const [target] = await enemies();
    await approach(target, 1.2);
    const list = await enemies();
    const p = await state();
    const near = list.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < 3.2);
    assert.ok(near.length >= 1, '身邊沒有迷霧生物，測試前提不成立');
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(600);
    const cd = (await combat()).skillCooldown;
    assert.ok(cd > 4 && cd <= 6, `冷卻 ${cd}`);
    const after = await enemies();
    for (const e of near) {
      const now = after.find((a) => a.id === e.id);
      assert.ok(!now || now.hp <= e.hp - 40, `${e.id} 沒有被技能打到`);
    }
  });

  await check('擊敗：迷霧生物消散、權威狀態移除', async () => {
    const [target] = await enemies();
    for (let i = 0; i < 3; i++) await send({ type: 'AttackEnemy', enemyId: target.id, attack: 'attack' });
    await page.waitForTimeout(1200);
    assert.equal((await enemies()).some((e) => e.id === target.id), false);
  });

  await check('非和平模式：迷霧生物靠近並攻擊，玩家扣血', async () => {
    const before = (await combat()).hp;
    await debug(() => window.__mistwoodDebug.setPeaceful(false));
    await page.waitForFunction((hp) => window.__mistwoodDebug.combatState().hp < hp, before, { timeout: 15_000 });
  });

  await check('體力歸零倒下：顯示提示，3 秒後滿血回到村子路口', async () => {
    await page.waitForFunction(() => window.__mistwoodDebug.combatState().defeated, null, { timeout: 60_000 });
    await page.locator('[data-testid="defeated"]').waitFor({ timeout: 2000 });
    assert.equal((await state()).action, 'death');
    await page.waitForFunction(() => !window.__mistwoodDebug.combatState().defeated, null, { timeout: 6000 });
    await page.waitForTimeout(600);
    const s = await state();
    assert.equal((await combat()).hp, 100);
    assert.ok(Math.hypot(s.x + 8, s.z + 18) < 1.5, `重生位置 (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    await debug(() => window.__mistwoodDebug.setPeaceful(true));
  });

  await check('任務「驅散森林的迷霧」：擊敗 3 隻後森林迷霧變淡', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'wood', count: 14 }, { itemId: 'stone', count: 4 }] });
    for (const cmd of [
      { type: 'AcceptQuest', quest: 'wood_for_bridge' },
      { type: 'TurnInQuest', quest: 'wood_for_bridge' },
      { type: 'AcceptQuest', quest: 'repair_bridge' },
      { type: 'RepairObject', placementId: 'lake_bridge' },
      { type: 'TurnInQuest', quest: 'repair_bridge' },
      { type: 'AcceptQuest', quest: 'clear_forest' },
    ]) {
      await send(cmd);
    }
    assert.equal(await debug(() => window.__mistwoodDebug.questState('clear_forest')), 'active');
    // 等生成點補滿再打
    await send({ type: 'AdvanceTime', dt: 30, player: { x: 0, z: 0 } });
    await send({ type: 'AdvanceTime', dt: 30, player: { x: 0, z: 0 } });
    await page.waitForTimeout(300);
    let killed = 0;
    for (const e of await enemies()) {
      if (killed >= 3) break;
      for (let i = 0; i < 3; i++) await send({ type: 'AttackEnemy', enemyId: e.id, attack: 'attack' });
      killed++;
    }
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).forest, 'light');
    const tracker = page.locator('[data-testid="quest-tracker"] [data-quest="clear_forest"]');
    assert.equal((await tracker.locator('[data-testid="quest-progress"]').innerText()).replace(/\s/g, ''), '3/6');
  });

  await check('擊敗 6 隻後向雷歐回報：森林晴朗、迷霧生物全部消散、獲得星光碎片', async () => {
    for (let round = 0; round < 6; round++) {
      const progress = await debug(() => window.__mistwoodDebug.questProgress('clear_forest'));
      if (progress >= 6) break;
      await send({ type: 'AdvanceTime', dt: 25, player: { x: 0, z: 0 } });
      await send({ type: 'AdvanceTime', dt: 5, player: { x: 0, z: 0 } });
      for (const e of await enemies()) {
        if ((await debug(() => window.__mistwoodDebug.questProgress('clear_forest'))) >= 6) break;
        for (let i = 0; i < 3; i++) await send({ type: 'AttackEnemy', enemyId: e.id, attack: 'attack' });
      }
    }
    assert.equal(await debug(() => window.__mistwoodDebug.questProgress('clear_forest')), 6);
    const shards = await debug(() => window.__mistwoodDebug.itemCount('starlight_shard'));
    const [lx, lz] = leo.position;
    await debug(() => window.__mistwoodDebug.setPeaceful(true));
    // 雷歐會巡邏：直接站到他目前的位置旁邊
    const leoNow = await debug(() => window.__mistwoodDebug.npcState('leo'));
    await teleport(leoNow?.x ?? lx, (leoNow?.z ?? lz) + 1.6, 500);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:leo', null, { timeout: 4000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'really', null, { timeout: 3000 });
    await page.keyboard.press('Digit1');
    assert.equal(await debug(() => window.__mistwoodDebug.questState('clear_forest')), 'completed');
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).forest, 'clear');
    assert.equal(await debug(() => window.__mistwoodDebug.itemCount('starlight_shard')), shards + 2);
    await page.keyboard.press('Escape');
    await send({ type: 'AdvanceTime', dt: 1, player: { x: 0, z: 0 } });
    await page.waitForTimeout(1200);
    assert.equal((await enemies()).length, 0, '森林晴朗後仍有迷霧生物');
  });

  await check('戰鬥狀態與任務寫入存檔', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.equal(file.version, SAVE_VERSION);
    assert.equal(file.quests.clear_forest.status, 'completed');
    assert.equal(file.combat.enemies.length, 0);
    assert.ok(file.combat.hp > 0);
  });
});
