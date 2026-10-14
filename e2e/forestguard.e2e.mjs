// 端對端：任務 8D-2 — quest_forest_003「苔冠下的守衛」（Bible §6.4、§6.5）。
// 向奇奇接取 → 苔咚平靜下來之前碰不到根源石、戰後的苔咚還不在 → 打倒苔咚（以除錯指令注水與攻擊）→
// 苔咚縮成 NPC（泡泡音）→ 按 E 啟動森林根源石取得芽之共鳴 → 向奇奇回報（戰後台詞）→ 林間水道的樹根退開、霧散去、存檔。
// 外觀以截圖檢查（node scripts/screenshot.mjs phase8 glowmoss_crown --guardian）。
// 用法：pnpm build && node e2e/forestguard.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const boss = JSON.parse(readFileSync('src/data/enemies.json', 'utf8')).find((e) => e.id === 'boss_moss_thump').boss;
const P = (id) => {
  const p = placements.find((x) => x.id === id);
  if (!p) throw new Error(`找不到 placement ${id}`);
  return p;
};
const STONE = 'glowmoss_root_stone';
const LAKE_ROOTS = 'glowmoss_lake_roots';

await runE2e('forestguard e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, interactTarget, itemCount, objectState }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const questState = (id) => debug((q) => window.__mistwoodDebug.questState(q), id);
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const toasts = () => debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
  const dialogueNode = () => debug(() => window.__mistwoodDebug.dialogue());

  /** 站在 (x, z) 往 (awayX, awayZ) 方向 distance 公尺處、面向它，等互動目標變成 expected */
  const approach = async (x, z, awayX, awayZ, expected, distance) => {
    const len = Math.hypot(awayX, awayZ) || 1;
    await teleport(x + (awayX / len) * distance, z + (awayZ / len) * distance, 700);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, expected, { timeout: 3000 });
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
      if ((await dialogueNode())?.nodeId === nodeId) return;
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
    }
    throw new Error(`對話沒有到達節點 ${nodeId}（目前 ${(await dialogueNode())?.nodeId}）`);
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
  /** 從根源石正面（刻紋那一面，西側）走近 */
  const approachStone = async () => {
    const p = P(STONE);
    const yaw = p.rotation[1];
    await approach(p.position[0], p.position[2], Math.sin(yaw), Math.cos(yaw), STONE, 2.1);
  };

  await debug(() => {
    const d = window.__mistwoodDebug;
    for (const q of ['wood_for_bridge', 'repair_bridge', 'quest_forest_001', 'quest_forest_002']) d.setQuestCompleted(q);
    d.travelToMap('glowmoss');
  });
  await page.waitForTimeout(2500);

  await check('奇奇交付「苔冠下的守衛」：接取後世界地圖標出苔冠空地', async () => {
    await talkTo('kiki');
    assert.equal((await dialogueNode()).dialogueId, 'kiki_guard_offer');
    await advanceTo('ask');
    await choose('我去讓苔咚平靜下來');
    assert.equal(await questState('quest_forest_003'), 'active');
    await closeDialogue();
    const markers = await debug(() => window.__mistwoodDebug.questMarkers());
    assert.ok(markers.some((m) => m.questId === 'quest_forest_003' && Math.hypot(m.x - boss.home[0], m.z - boss.home[1]) < 1), JSON.stringify(markers));
  });

  await check('苔咚平靜下來之前：按 E 碰根源石被擋下、戰後的苔咚還不在', async () => {
    await approachStone();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
    assert.equal((await objectState(STONE))?.active, undefined);
    assert.ok((await toasts()).includes('toast.guardianAwake'));
    const [nx, nz] = npcs.find((n) => n.id === 'moss_thump').position;
    await teleport(nx - 1.6, nz, 500);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [nx, nz]);
    await page.waitForTimeout(300);
    assert.notEqual(await interactTarget(), 'npc:moss_thump');
  });

  await check('打倒苔咚後牠縮成 NPC：對話是泡泡音與動作，並示意根源石', async () => {
    await teleport(boss.arena.center[0] - 12, boss.arena.center[1], 800);
    await page.waitForFunction(() => window.__mistwoodDebug.boss() !== null, null, { timeout: 4000 });
    const b = await debug(() => window.__mistwoodDebug.boss());
    for (const id of boss.troughs) await send({ type: 'ActivateObject', placementId: id });
    for (let i = 0; i < 80 && (await debug(() => window.__mistwoodDebug.boss())); i++) await send({ type: 'AttackEnemy', enemyId: b.enemyId, attack: 'spell_starlight_burst' });
    assert.deepEqual(await debug(() => window.__mistwoodDebug.defeatedBosses()), ['boss_moss_thump']);
    await page.waitForTimeout(3200);
    const bubbles = await debug(() => window.__mistwoodDebug.audio().played.bubble ?? 0);
    await talkTo('moss_thump');
    assert.equal((await dialogueNode()).dialogueId, 'moss_thump_stone');
    assert.match(await box.innerText(), /咚/);
    assert.ok((await debug(() => window.__mistwoodDebug.audio().played.bubble ?? 0)) > bubbles, '沒有泡泡音');
    await closeDialogue();
  });

  await check('按 E 啟動根源石：取得芽之共鳴、石頭亮起、任務可以回報', async () => {
    await approachStone();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
    assert.equal((await objectState(STONE))?.active, true);
    assert.equal(await itemCount('seed_resonance_bud'), 1);
    assert.ok((await toasts()).includes('toast.resonance'));
    assert.deepEqual(await debug(() => window.__mistwoodDebug.questObjectives('quest_forest_003')), [
      { current: 1, target: 1 },
      { current: 1, target: 1 },
    ]);
    // 已啟動的石頭不再能互動
    await page.waitForTimeout(300);
    assert.notEqual(await interactTarget(), STONE);
  });

  await check('向奇奇回報：戰後台詞、苔蘚披肩布料、苔冠空地的霧散去、林間水道的樹根退開', async () => {
    await talkTo('kiki');
    assert.equal((await dialogueNode()).dialogueId, 'kiki_guard_turnin');
    await choose('苔咚平靜下來了');
    assert.equal(await questState('quest_forest_003'), 'completed');
    await advanceTo('guardian');
    assert.match(await box.innerText(), /牠只是怕再也沒有地方可以保護了/);
    await closeDialogue();
    assert.equal(await itemCount('moss_shawl_cloth'), 1);
    assert.equal((await debug(() => window.__mistwoodDebug.mistStages())).moss_crown, 'clear');
    assert.equal((await objectState(LAKE_ROOTS))?.active, true);
    // 樹根退開後不再能閱讀（整個隱藏），旁邊的路標可以讀
    const roots = P(LAKE_ROOTS);
    await teleport(roots.position[0], roots.position[2] - 3, 600);
    await debug(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [roots.position[0], roots.position[2]]);
    await page.waitForTimeout(300);
    assert.notEqual(await interactTarget(), LAKE_ROOTS);
  });

  await check('戰後的苔咚說出短語；存檔記錄任務完成與根源石', async () => {
    await talkTo('moss_thump');
    assert.equal((await dialogueNode()).dialogueId, 'moss_thump_restored');
    await advanceTo('words');
    assert.match(await box.innerText(), /咚……芽……水……回來了/);
    await closeDialogue();
    const save = JSON.parse(await debug(() => window.__mistwoodDebug.exportSave()));
    assert.equal(save.quests.quest_forest_003.status, 'completed');
    assert.ok(JSON.stringify(save).includes(STONE));
  });
});
