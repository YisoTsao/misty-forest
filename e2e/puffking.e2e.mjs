// 端對端：任務 7E — 霧團噗啾王（Bible §5.5）。
// 燈塔點亮前走進高地的空地不會開戰；點亮後開戰（HUD、提示）→ 不是蓄力時轉星光鏡沒有用 → 蓄力時按 E 轉動星光鏡，牠暈眩 →
// 衝撞實際打中玩家 → 擊敗後掉落、縮成小噗啾跑到村外（NPC，泡泡音）→ 米菈的戰後對話。
// 外觀以截圖檢查（node scripts/screenshot.mjs phase7 highland --puffking）。
// 用法：pnpm build && node e2e/puffking.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const def = JSON.parse(readFileSync('src/data/enemies.json', 'utf8')).find((e) => e.id === 'boss_dawn_mist_puff');
const boss = def.boss;
const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const mirror = placements.find((p) => p.id === boss.stun.mirrors[0]);
const [CX, CZ] = boss.arena.center;

await runE2e('puffking e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const g = (fn, arg) => debug(fn, arg);
  const bossState = () => g(() => window.__mistwoodDebug.boss());
  const send = (cmd) => g((c) => window.__mistwoodDebug.send(c), cmd);
  const setPeaceful = (p) => g((v) => window.__mistwoodDebug.setPeaceful(v), p);
  const toasts = () => g(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
  const waitBoss = (state, timeout = 6000) => page.waitForFunction((s) => window.__mistwoodDebug.boss()?.state === s, state, { timeout });
  const hud = page.getByTestId('boss-bar');
  const box = page.locator('[data-testid="dialogue"]');
  const talkTo = async (npcId) => {
    const n = npcs.find((x) => x.id === npcId);
    const [x, z] = n.position;
    await teleport(x + Math.sin(n.facingYaw) * 1.8, z + Math.cos(n.facingYaw) * 1.8, 700);
    await g(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [x, z]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, `npc:${npcId}`, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
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
  /** 站在星光鏡前面（鏡面那一側），面向鏡子 */
  const atMirror = async () => {
    const yaw = mirror.rotation[1];
    await teleport(mirror.position[0] + Math.sin(yaw) * 1.5, mirror.position[2] + Math.cos(yaw) * 1.5, 600);
    await g(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [mirror.position[0], mirror.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, mirror.id, { timeout: 3000 });
  };

  await check('燈塔點亮前，走進高地的空地不會開戰', async () => {
    await teleport(CX, CZ + 4, 1500);
    assert.equal(await bossState(), null);
  });

  await check('燈塔點亮後走進空地：霧團噗啾王現身、HUD 顯示名稱與星光鏡提示、沒有水槽', async () => {
    await teleport(boss.retryAt[0], boss.retryAt[1], 400);
    await g(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));
    await teleport(CX + 4, CZ + 4, 800);
    const b = await bossState();
    assert.ok(b, '沒有開戰');
    assert.equal(b.name, '霧團噗啾王');
    await hud.waitFor({ timeout: 2000 });
    assert.equal(await page.getByTestId('boss-trough').count(), 0);
    assert.match(await hud.innerText(), /星光鏡/);
    await waitBoss('chase', (boss.introSec + 1) * 1000);
  });

  await check('不是蓄力時轉星光鏡沒有用；蓄力時按 E 轉動，牠被燈塔的光照到暈眩', async () => {
    await atMirror();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
    assert.ok((await toasts()).includes('puffKing.mirrorEarly'), JSON.stringify(await toasts()));
    assert.notEqual((await bossState()).state, 'stunned');
    // 和平模式下頭目不出招：暫時關掉，指定下一招是膨脹震地
    await send({ type: 'Rest' });
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('slam'));
    await waitBoss('slam', 6000);
    await page.keyboard.press('KeyE');
    await waitBoss('stunned', 1500);
    await setPeaceful(true);
    assert.ok((await toasts()).includes('puffKing.stunned'));
    await waitBoss('chase', (boss.stun.sec + 2) * 1000);
  });

  await check('衝撞：站在前方被撞到扣血', async () => {
    const b = await bossState();
    await teleport(b.x, b.z + 6, 300);
    await send({ type: 'Rest' });
    const hp = await g(() => window.__mistwoodDebug.combatState().hp);
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('charge'));
    await page.waitForFunction((h) => window.__mistwoodDebug.combatState().hp < h, hp, { timeout: 6000 });
    await setPeaceful(true);
  });

  await check('擊敗：掉落、縮成小噗啾跑到村外（泡泡音），米菈說牠只是生病了', async () => {
    const b = await bossState();
    for (let i = 0; i < 60 && (await bossState()); i++) {
      await send({ type: 'AttackEnemy', enemyId: b.enemyId, attack: 'spell_starlight_burst' });
      await g(() => window.__mistwoodDebug.setMp(100));
    }
    assert.equal(await bossState(), null);
    assert.deepEqual(await g(() => window.__mistwoodDebug.defeatedBosses()), ['boss_dawn_mist_puff']);
    assert.ok((await itemCount('starlight_shard')) >= 2);
    await hud.waitFor({ state: 'detached', timeout: 2000 });
    await teleport(CX, CZ + 4, 1500);
    assert.equal(await bossState(), null, '擊敗後不該再開戰');
    const bubbles = await g(() => window.__mistwoodDebug.audio().played.bubble ?? 0);
    await talkTo('puff');
    assert.equal((await g(() => window.__mistwoodDebug.dialogue())).dialogueId, 'puff_buddy');
    assert.ok((await g(() => window.__mistwoodDebug.audio().played.bubble ?? 0)) > bubbles);
    await closeDialogue();
    await talkTo('elder');
    assert.equal((await g(() => window.__mistwoodDebug.dialogue())).dialogueId, 'elder_puff_after');
    await closeDialogue();
  });
});
