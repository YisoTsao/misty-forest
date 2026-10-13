// 端對端：任務 3D — 湖泊與木橋：落水回到安全點、斷橋過不去、修橋任務（接取 → 材料不足 → 修好 → 走到小島 → 回報）、
// 湖的迷霧清除、修好的狀態存檔。
// 用法：pnpm build && node e2e/lake.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runE2e, tempSaveDir } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const balu = npcs.find((n) => n.id === 'balu');
const saveDir = tempSaveDir();
const DECK_Y = 0.45;

await runE2e('lake e2e', { env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug, state, camera, teleport, teleportOnto, objectState, itemCount, interactTarget }) => {
  const give = (items) => debug((it) => window.__mistwoodDebug.send({ type: 'DebugGiveItems', items: it }), items);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const walk = async (ms) => {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
  };

  await check('走進湖裡會回到岸上的安全點（不在水裡重生）', async () => {
    await teleport(14, 8);
    await page.waitForTimeout(600); // 在岸上站穩，記錄安全點
    const before = (await state()).respawnCount;
    await teleport(26, 1); // 湖中央偏北，水深處
    await page.waitForTimeout(1500);
    const s = await state();
    assert.equal(s.respawnCount, before + 1, '沒有觸發落水重生');
    assert.ok(s.grounded, '重生後沒有站在地面上');
    assert.ok(s.x < 20, `重生在水裡：(${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
  });

  await check('進入湖區顯示「鏡湖」，任務未接取時斷橋沒有互動提示', async () => {
    await teleportOnto(20.6, 8, DECK_Y);
    await page.waitForTimeout(800);
    assert.equal(await debug(() => window.__mistwoodDebug.region()), 'lake');
    assert.notEqual(await interactTarget(), 'lake_bridge');
  });

  await check('斷橋中段缺了一截：往小島跑會掉進水裡', async () => {
    await teleportOnto(19.5, 8, DECK_Y);
    await page.waitForTimeout(500);
    await camera({ yaw: -Math.PI / 2, pitch: 0.35, distance: 6 }); // W = 往 +X
    const before = (await state()).respawnCount;
    await page.keyboard.down('ShiftLeft');
    await walk(2500);
    await page.keyboard.up('ShiftLeft');
    await page.waitForTimeout(800);
    // 掉下去後會回到橋上的安全點；一直往前跑會再掉下去，所以至少掉一次、而且永遠到不了小島
    const s = await state();
    assert.ok(s.respawnCount > before, `沒有掉下去（x=${s.x.toFixed(1)}）`);
    assert.ok(s.x < 30, '竟然走到了小島');
  });

  await check('向巴魯接取「修復湖邊的木橋」（完成木材任務後）', async () => {
    await give([{ itemId: 'wood', count: 6 }]);
    await send({ type: 'AcceptQuest', quest: 'wood_for_bridge' });
    await send({ type: 'TurnInQuest', quest: 'wood_for_bridge' });
    const [bx, bz] = balu.position;
    await teleport(bx + Math.sin(balu.facingYaw) * 1.8, bz + Math.cos(balu.facingYaw) * 1.8, 500);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:balu', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'plan');
    await page.keyboard.press('Digit1');
    assert.equal(await debug(() => window.__mistwoodDebug.questState('repair_bridge')), 'active');
    await page.keyboard.press('Escape');
  });

  await check('材料不足時修不了，提示需要的材料', async () => {
    await give([{ itemId: 'wood', count: 8 }]);
    await teleportOnto(20.6, 8, DECK_Y);
    await camera({ yaw: -Math.PI / 2, pitch: 0.35, distance: 6 });
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'lake_bridge', null, { timeout: 3000 });
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /修理\s*斷掉的木橋/);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.equal(await objectState('lake_bridge'), null);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'toast.missingMaterials'), JSON.stringify(toasts));
    assert.equal(await itemCount('wood'), 8);
  });

  await check('帶齊材料按 E 修好木橋：消耗材料、外觀與碰撞換成完整的橋', async () => {
    await give([{ itemId: 'stone', count: 4 }]);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(900);
    assert.equal((await objectState('lake_bridge'))?.repaired, true);
    assert.equal(await itemCount('wood'), 0);
    assert.equal(await itemCount('stone'), 0);
    assert.notEqual(await interactTarget(), 'lake_bridge');
  });

  await check('走過修好的橋到小島', async () => {
    await teleportOnto(19.5, 8, DECK_Y);
    await page.waitForTimeout(800); // 碰撞體換成完整的橋
    await camera({ yaw: -Math.PI / 2, pitch: 0.35, distance: 6 });
    const before = (await state()).respawnCount;
    await walk(5200);
    const s = await state();
    assert.equal(s.respawnCount, before, '過橋時掉下去了');
    assert.ok(s.x > 33, `沒有走到小島（x=${s.x.toFixed(1)}）`);
    assert.ok(s.grounded);
  });

  await check('向巴魯回報：獲得獎勵，湖的迷霧變為晴朗', async () => {
    const [bx, bz] = balu.position;
    await teleport(bx + Math.sin(balu.facingYaw) * 1.8, bz + Math.cos(balu.facingYaw) * 1.8, 500);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:balu', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'heard');
    await page.keyboard.press('Digit1');
    assert.equal(await debug(() => window.__mistwoodDebug.questState('repair_bridge')), 'completed');
    assert.equal(await itemCount('starlight_shard'), 2);
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).lake, 'clear');
    await page.keyboard.press('Escape');
  });

  await check('修好的木橋寫入存檔', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.saveNow()), true);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.ok(file.world.objects.some((o) => o.placementId === 'lake_bridge' && o.repaired));
    assert.equal(file.mist.lake, 'clear');
  });
});
