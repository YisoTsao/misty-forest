// 端對端：任務 9E-1 — 璃漪，回聲鯉龍（Bible §7.5）。
// 沒接「倒影中的守護者」時走進水鏡神殿不會開戰；接了以後開戰（HUD、提示）→ 平常打到的是倒影（傷害很少、提示）
// → 不是蓄力時轉神殿的水鏡沒有用 → 蓄力時按 E 轉動，真身顯形（暈眩）→ 顯形時打得痛 → 水柱打中玩家 → 擊敗、任務可以回報。
// 外觀以截圖檢查（node scripts/screenshot.mjs phase9 mirrorlake_temple --liyi）。
// 用法：pnpm build && node e2e/liyi.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const def = JSON.parse(readFileSync('src/data/enemies.json', 'utf8')).find((e) => e.id === 'boss_liyi_echo_koi');
const boss = def.boss;
const mirror = placements.find((p) => p.id === boss.stun.mirrors[0]);
const [CX, CZ] = boss.arena.center;
const Q = 'quest_lake_003';

await runE2e('liyi e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
  const g = (fn, arg) => debug(fn, arg);
  const bossState = () => g(() => window.__mistwoodDebug.boss());
  const send = (cmd) => g((c) => window.__mistwoodDebug.send(c), cmd);
  const setPeaceful = (p) => g((v) => window.__mistwoodDebug.setPeaceful(v), p);
  const toasts = () => g(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
  const waitBoss = (state, timeout = 6000) => page.waitForFunction((s) => window.__mistwoodDebug.boss()?.state === s, state, { timeout });
  const hud = page.getByTestId('boss-bar');
  const atMirror = async () => {
    const yaw = mirror.rotation[1];
    // 鏡面朝神殿中央：站在鏡子前方（戰場那一側）
    await teleport(mirror.position[0] + Math.sin(yaw) * 1.8, mirror.position[2] + Math.cos(yaw) * 1.8, 500);
    await g(([fx, fz]) => window.__mistwoodDebug.face(fx, fz), [mirror.position[0], mirror.position[2]]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, mirror.id, { timeout: 3000 });
  };

  await g(() => {
    const d = window.__mistwoodDebug;
    for (const q of ['quest_forest_003', 'quest_lake_001', 'quest_lake_002']) d.setQuestCompleted(q);
  });

  await check('沒接「倒影中的守護者」時走進水鏡神殿不會開戰', async () => {
    await teleport(CX - 4, CZ + 2, 1500);
    assert.equal(await bossState(), null);
  });

  await check('接了任務走進神殿：璃漪從湖裡升起、HUD 顯示名稱與水鏡提示', async () => {
    await teleport(boss.retryAt[0], boss.retryAt[1], 600);
    await send({ type: 'AcceptQuest', quest: Q });
    await teleport(CX - 4, CZ + 2, 900);
    const b = await bossState();
    assert.ok(b, '沒有開戰');
    assert.equal(b.name, '璃漪');
    await hud.waitFor({ timeout: 2000 });
    assert.match(await hud.innerText(), /水鏡/);
    await waitBoss('chase', (boss.introSec + 1.5) * 1000);
  });

  await check('平常打到的是倒影：傷害很少，提示用水鏡照出真身', async () => {
    const b = await bossState();
    const hp0 = b.hp;
    await g(([id]) => window.__mistwoodDebug.hitEnemy(id, 'spell_starlight_burst'), [b.enemyId]);
    await page.waitForTimeout(300);
    const veiled = hp0 - (await bossState()).hp;
    assert.ok(veiled > 0 && veiled <= 12, `倒影傷害 ${veiled}`);
    assert.ok((await toasts()).includes('liyi.veiled'), JSON.stringify(await toasts()));
  });

  await check('不是蓄力時轉水鏡沒有用；蓄力時按 E 轉動，真身顯形（暈眩），這時打得痛', async () => {
    await atMirror();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    assert.ok((await toasts()).includes('liyi.mirrorEarly'), JSON.stringify(await toasts()));
    assert.notEqual((await bossState()).state, 'stunned');
    await send({ type: 'Rest' });
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('spores'));
    await waitBoss('spores', 8000);
    await page.keyboard.press('KeyE');
    await waitBoss('stunned', 1500);
    await setPeaceful(true);
    assert.ok((await toasts()).includes('liyi.stunned'));
    const b = await bossState();
    await g(() => window.__mistwoodDebug.setMp(100));
    // 與實際出招相同：附上頭目目前的姿態（暈眩 = 破綻）
    await g(([id]) => window.__mistwoodDebug.hitEnemy(id, 'spell_starlight_burst'), [b.enemyId]);
    await page.waitForTimeout(300);
    const revealed = b.hp - (await bossState()).hp;
    assert.ok(revealed > 20, `顯形時的傷害 ${revealed}`);
    await waitBoss('chase', (boss.stun.sec + 3) * 1000);
  });

  await check('水柱：站在戰場裡，腳下起波紋後被水柱打中扣血', async () => {
    const b = await bossState();
    await teleport(CX - 3, CZ - 3, 300);
    await send({ type: 'Rest' });
    const hp = await g(() => window.__mistwoodDebug.combatState().hp);
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('spikes'));
    await page.waitForFunction((h) => window.__mistwoodDebug.combatState().hp < h, hp, { timeout: 8000 });
    await setPeaceful(true);
    assert.ok(b);
    await send({ type: 'Rest' });
  });

  await check('擊敗（顯形時）：璃漪沉回湖裡，任務可以回報伊芙', async () => {
    const b = await bossState();
    for (let i = 0; i < 80 && (await bossState()); i++) {
      await send({ type: 'AttackEnemy', enemyId: b.enemyId, attack: 'spell_starlight_burst', stance: 'recover' });
      await g(() => window.__mistwoodDebug.setMp(100));
    }
    assert.equal(await bossState(), null);
    assert.ok((await g(() => window.__mistwoodDebug.defeatedBosses())).includes('boss_liyi_echo_koi'));
    await hud.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal(await g((q) => window.__mistwoodDebug.questProgress(q), Q), 1);
    await teleport(CX - 4, CZ + 2, 1500);
    assert.equal(await bossState(), null, '擊敗後不該再開戰');
  });
});
