// 端對端：任務 8C — 螢苔祕林的琳娜與奇奇（Bible §6.4）。
// quest_forest_001：向琳娜接取 → 點亮林緣小徑的三盞路燈 → 帶著螢苔與月露草回報 → 林緣小徑的霧散去。
// quest_forest_002：向奇奇接取 → 移開樹根（得到根纖維）→ 打開兩座閘門 → 修補渠段 → 水流到分水木輪 →
// 轉動木輪把水引到三塊苔蘚 → 回報後苔冠空地入口的樹根退開、可以走進去。
// 以除錯 API 讀權威狀態與水道畫面狀態（水面推進、汲水輪轉動、分水盆轉向），外觀以截圖檢查（glowmoss_channel 書籤）。
// 用法：pnpm build && node e2e/forestquest.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const prefabsList = JSON.parse(readFileSync('src/data/prefabs.json', 'utf8'));
const prefab = (id) => prefabsList.find((p) => p.id === id);
const P = (id) => {
  const p = placements.find((x) => x.id === id);
  if (!p) throw new Error(`找不到 placement ${id}`);
  return p;
};
/** placement 局部 (x, z) → 世界座標（與 worldIndex 相同） */
const local = (p, x, z) => {
  const yaw = p.rotation[1];
  return [p.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw), p.position[2] - x * Math.sin(yaw) + z * Math.cos(yaw)];
};
const LANTERNS = ['glowmoss_lantern_01', 'glowmoss_lantern_02', 'glowmoss_lantern_03'];
const NODES = ['glowmoss_moss_node_01', 'glowmoss_moss_node_02', 'glowmoss_moss_node_03'];

await runE2e('forestquest e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, interactTarget, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const questState = (id) => debug((q) => window.__mistwoodDebug.questState(q), id);
  const waterway = () => debug(() => window.__mistwoodDebug.waterway());
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const state = () => debug(() => window.__mistwoodDebug.playerState());

  /** 站在 (x, z) 往外 distance 公尺處、面向它，等互動目標變成 expected */
  const approach = async (x, z, awayX, awayZ, expected, distance = 1.2) => {
    const len = Math.hypot(awayX, awayZ) || 1;
    await teleport(x + (awayX / len) * distance, z + (awayZ / len) * distance, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
  };
  /** 物件的互動點（prefab 的 interactOffset），從局部 +X 那一側走近 */
  const approachObject = async (id, from = [1, 0]) => {
    const p = P(id);
    const off = prefab(p.prefabId).interactOffset ?? [0, 0, 0];
    const [ix, iz] = local(p, off[0], off[2]);
    const [ax, az] = local(p, off[0] + from[0], off[2] + from[1]);
    await approach(ix, iz, ax - ix, az - iz, id);
  };
  /** 按 E 互動，等動作結束 */
  const pressE = async () => {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
  };
  const talkTo = async (npcId) => {
    const n = npcs.find((x) => x.id === npcId);
    const [x, z] = n.position;
    await approach(x, z, Math.sin(n.facingYaw), Math.cos(n.facingYaw), `npc:${npcId}`, 1.8);
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };
  const advanceTo = async (nodeId) => {
    for (let i = 0; i < 8; i++) {
      if ((await debug(() => window.__mistwoodDebug.dialogue()?.nodeId)) === nodeId) return;
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    throw new Error(`對話沒有到達節點 ${nodeId}（目前 ${await debug(() => window.__mistwoodDebug.dialogue()?.nodeId)}）`);
  };
  const choose = async (text) => {
    await page.locator('[data-testid="dialogue-option"]', { hasText: text }).click();
    await page.waitForTimeout(150);
  };
  const closeDialogue = async () => {
    for (let i = 0; i < 6 && (await box.count()) > 0; i++) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
    }
    // 最後一個節點有選項（例如米菈的「看看補給品」）時 Space 不會關閉，改按 Esc
    if ((await box.count()) > 0) await page.keyboard.press('Escape');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  };
  /** 往 (x, z) 方向按住 W 走 ms 毫秒 */
  const walkToward = async (x, z, ms) => {
    const s = await state();
    // 攝影機在角色背後：W 往攝影機前方走（與 bounds.e2e 相同的換算）
    await debug((yaw) => window.__mistwoodDebug.camera({ yaw, pitch: 0.35, distance: 6 }), Math.atan2(-(x - s.x), -(z - s.z)));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(300);
  };

  await debug(() => window.__mistwoodDebug.setQuestCompleted('wood_for_bridge'));
  await debug(() => window.__mistwoodDebug.setQuestCompleted('repair_bridge'));
  await debug(() => window.__mistwoodDebug.travelToMap('glowmoss'));
  await page.waitForFunction(() => window.__mistwoodDebug.currentMap().shown === 'glowmoss', null, { timeout: 4000 });
  await page.waitForTimeout(1200);

  await check('接取前：路燈沒有互動提示；奇奇請你先去幫琳娜', async () => {
    const p = P(LANTERNS[0]);
    const yaw = p.rotation[1];
    await teleport(p.position[0] + Math.sin(yaw) * 1.3, p.position[2] + Math.cos(yaw) * 1.3, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [p.position[0], p.position[2]]);
    await page.waitForTimeout(400);
    assert.notEqual(await interactTarget(), LANTERNS[0]);
    await talkTo('kiki');
    await advanceTo('later');
    await closeDialogue();
    assert.equal(await questState('quest_forest_002'), 'locked');
  });

  await check('與琳娜對話接取「不會發光的路」，追蹤列出螢苔、月露草與路燈', async () => {
    await talkTo('linna');
    await advanceTo('ask');
    await choose('交給我吧');
    assert.equal(await questState('quest_forest_001'), 'active');
    await closeDialogue();
    const tracker = page.locator('[data-testid="quest-tracker"] [data-quest="quest_forest_001"]');
    await tracker.waitFor({ timeout: 2000 });
    const text = await tracker.innerText();
    assert.match(text, /不會發光的路/);
    assert.match(text, /螢苔/);
    assert.match(text, /點亮林緣小徑的三盞路燈\s*0 \/ 3/);
  });

  await check('點亮三盞路燈：提示「點亮 林間路燈」，按 E 後亮起、不能再點', async () => {
    for (const id of LANTERNS) {
      const p = P(id);
      const yaw = p.rotation[1];
      await approach(p.position[0], p.position[2], Math.sin(yaw), Math.cos(yaw), id, 1.3);
      assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /點亮\s*林間路燈/);
      await pressE();
      assert.equal((await objectState(id))?.active, true, id);
      await page.waitForTimeout(200);
      assert.notEqual(await interactTarget(), id);
    }
    const progress = await debug(() => window.__mistwoodDebug.questObjectives('quest_forest_001'));
    assert.deepEqual(progress[2], { current: 3, target: 3 });
  });

  await check('帶著螢苔 × 5、月露草 × 3 回報：領到月露藥膏，林緣小徑的霧散去，奇奇的任務可以接了', async () => {
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'glow_moss', count: 5 }, { itemId: 'moondew_herb', count: 3 }] });
    await talkTo('linna');
    await choose('這些給你');
    assert.equal(await questState('quest_forest_001'), 'completed');
    await closeDialogue();
    assert.equal(await itemCount('moondew_salve'), 2);
    assert.equal(await itemCount('glow_moss'), 0);
    assert.equal(await debug(() => window.__mistwoodDebug.mistStages().moss_trail), 'clear');
    assert.equal(await questState('quest_forest_002'), 'available');
  });

  await check('與奇奇對話接取「把水還給森林」；水停在堵住渠道的樹根前', async () => {
    await talkTo('kiki');
    await advanceTo('wheel');
    await choose('我來幫忙');
    assert.equal(await questState('quest_forest_002'), 'active');
    await closeDialogue();
    const w = await waterway();
    assert.equal(w.cleared, 0);
    assert.equal(w.flowing, false);
    assert.ok(w.channelReach > 0 && w.channelReach < 40, `水面推進到 ${w.channelReach}`);
  });

  await check('移開樹根（揮砍動作）：得到根纖維 × 2，水往下游流到第一座閘門', async () => {
    const before = (await waterway()).channelReach;
    await approachObject('glowmoss_channel_roots', [0, 1.6]);
    assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /移開\s*堵住渠道的樹根/);
    await pressE();
    assert.equal((await objectState('glowmoss_channel_roots'))?.active, true);
    assert.equal(await itemCount('root_fiber'), 2);
    await page.waitForTimeout(1500);
    const w = await waterway();
    assert.equal(w.cleared, 1);
    assert.ok(w.channelReach > before + 10, `水面 ${before} → ${w.channelReach}`);
  });

  await check('打開兩座古水渠閘門（閘板拉起）；水流到崩塌的渠段為止', async () => {
    for (const id of ['glowmoss_water_gate_01', 'glowmoss_water_gate_02']) {
      await approachObject(id);
      assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /打開\s*古水渠閘門/);
      await pressE();
      assert.equal((await objectState(id))?.active, true, id);
    }
    assert.equal((await waterway()).cleared, 3);
  });

  await check('修補崩塌的渠段：缺石頭時提示材料；補齊後修好，水流到分水木輪，木輪開始轉，第一塊苔蘚醒來', async () => {
    await approachObject('glowmoss_channel_breach');
    await pressE();
    assert.notEqual((await objectState('glowmoss_channel_breach'))?.repaired, true);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'toast.missingMaterials'), JSON.stringify(toasts));
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'stone', count: 4 }] });
    await approachObject('glowmoss_channel_breach');
    await pressE();
    assert.equal((await objectState('glowmoss_channel_breach'))?.repaired, true);
    assert.equal(await itemCount('root_fiber'), 0);
    const w = await waterway();
    assert.equal(w.flowing, true);
    assert.equal(w.outlet, NODES[0]);
    assert.equal((await objectState(NODES[0]))?.active, true);
    const a0 = w.rotorAngle;
    await page.waitForTimeout(2500);
    const w2 = await waterway();
    assert.ok(w2.rotorAngle > a0 + 0.5, `汲水輪轉角 ${a0} → ${w2.rotorAngle}`);
    assert.ok(w2.flumeReach[0] > 5, `第一道木槽的水 ${w2.flumeReach[0]}`);
  });

  await check('轉動分水木輪：分水盆轉向下一道木槽，水流過去喚醒第二、第三塊苔蘚', async () => {
    for (const k of [1, 2]) {
      const before = (await waterway()).spoutYaw;
      await approachObject('glowmoss_water_wheel');
      assert.match(await page.locator('[data-testid="interact-prompt"]').innerText(), /轉動\s*分水木輪/);
      await pressE();
      await page.waitForTimeout(1500);
      const w = await waterway();
      assert.equal(w.turn, k);
      assert.equal((await objectState(NODES[k]))?.active, true, NODES[k]);
      assert.ok(Math.abs(w.spoutYaw - before) > 0.5, `分水盆 ${before} → ${w.spoutYaw}`);
      assert.ok(w.flumeReach[k] > 2, `木槽 ${k} 的水 ${w.flumeReach[k]}`);
    }
    const progress = await debug(() => window.__mistwoodDebug.questObjectives('quest_forest_002'));
    assert.ok(progress.every((p) => p.current === p.target), JSON.stringify(progress));
  });

  const crown = P('glowmoss_crown_roots');
  const outside = [crown.position[0] - 7, crown.position[2]];
  const inside = [crown.position[0] + 20, crown.position[2]];

  await check('回報之前：苔冠空地的入口被樹根擋住，走不進去；可以閱讀樹根的說明', async () => {
    await teleport(outside[0], outside[1], 900);
    await walkToward(inside[0], inside[1], 3000);
    const s = await state();
    assert.ok(s.x < crown.position[0], `玩家穿過了樹根：x = ${s.x.toFixed(1)}`);
    await approach(crown.position[0], crown.position[2], -1, 0, 'glowmoss_crown_roots', 2.2);
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    assert.match(await dialog.innerText(), /水回來/);
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('回報奇奇：領到小瓶草藥水，螢苔林地的霧散去，苔冠空地的樹根退開', async () => {
    await talkTo('kiki');
    await choose('三塊苔蘚都喝到水了');
    assert.equal(await questState('quest_forest_002'), 'completed');
    await closeDialogue();
    assert.equal(await itemCount('herb_potion'), 2);
    assert.equal(await debug(() => window.__mistwoodDebug.mistStages().moss_glade), 'clear');
    assert.equal((await objectState('glowmoss_crown_roots'))?.active, true);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'toast.objectReleased'), JSON.stringify(toasts));
  });

  await check('樹根退開後可以走進苔冠空地', async () => {
    await teleport(outside[0], outside[1], 900);
    await walkToward(inside[0], inside[1], 3500);
    const s = await state();
    assert.ok(s.x > crown.position[0] + 2, `沒有走進去：x = ${s.x.toFixed(1)}`);
  });
});
