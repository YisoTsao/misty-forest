// 端對端：任務 8D — 苔咚，苔冠守衛（Bible §6.5、§27.4）。
// 沒接奇奇的「苔冠下的守衛」前不會開戰（8D-2）；接了以後走進苔冠空地開戰（HUD、入口樹根封住）；按 E 把水引進水槽讓迷霧退去；
// 根刺 / 跳躍震地 / 睡眠孢子實際打中玩家、跑開躲得掉；倒下後在入口外重來（水槽保留）；擊敗後掉落、入口打開、不再開戰。
// 外觀以截圖檢查（node scripts/screenshot.mjs <階段> --boss）。
// 用法：pnpm build && node e2e/boss.e2e.mjs
/* global window, document */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const def = JSON.parse(readFileSync('src/data/enemies.json', 'utf8')).find((e) => e.id === 'boss_moss_thump');
const boss = def.boss;
const placements = JSON.parse(readFileSync('src/data/placements.json', 'utf8'));
const P = (id) => placements.find((p) => p.id === id);
const [CX, CZ] = boss.arena.center;

await runE2e('boss e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, interactTarget, itemCount, objectState }) => {
  const g = (fn, arg) => debug(fn, arg);
  const bossState = () => g(() => window.__mistwoodDebug.boss());
  const hp = () => g(() => window.__mistwoodDebug.combatState().hp);
  const setPeaceful = (p) => g((v) => window.__mistwoodDebug.setPeaceful(v), p);
  const send = (cmd) => g((c) => window.__mistwoodDebug.send(c), cmd);
  const heal = () => send({ type: 'Rest' });
  const waitBoss = (state, timeout = 6000) => page.waitForFunction((s) => window.__mistwoodDebug.boss()?.state === s, state, { timeout });
  const hud = page.getByTestId('boss-bar');

  await g(() => {
    const d = window.__mistwoodDebug;
    d.setQuestCompleted('wood_for_bridge');
    d.setQuestCompleted('repair_bridge');
    d.travelToMap('glowmoss');
  });
  await page.waitForTimeout(2500);

  await check('沒接守衛任務前，走進苔冠空地不會開戰', async () => {
    await teleport(CX - 10, CZ, 1500);
    assert.equal(await bossState(), null);
    assert.equal(await hud.count(), 0);
  });

  await check('接了守衛任務後走進空地：苔咚從地底鑽出來、HUD 顯示名稱與三個乾水槽', async () => {
    await teleport(CX - 22, CZ, 400);
    await g(() => window.__mistwoodDebug.setQuestCompleted('quest_forest_002'));
    await send({ type: 'AcceptQuest', quest: 'quest_forest_003' });
    await page.waitForTimeout(400);
    assert.equal(await bossState(), null, '還沒走進空地就開戰');
    await teleport(CX - 12, CZ, 600);
    const b = await bossState();
    assert.ok(b, '沒有開戰');
    assert.equal(b.state, 'intro');
    assert.equal(b.name, '苔咚，苔冠守衛');
    await hud.waitFor({ timeout: 2000 });
    assert.equal(await hud.getAttribute('data-filled'), '0');
    assert.equal(await page.getByTestId('boss-trough').count(), 3);
    assert.match(await hud.innerText(), /把水引進空地邊的三個水槽/);
    await waitBoss('chase', (boss.introSec + 1) * 1000);
  });

  await check('開戰後入口被樹根封住：往入口走出不去', async () => {
    const [gx, gz] = boss.gate.center;
    await teleport(gx + 5, gz, 500);
    await g(() => window.__mistwoodDebug.camera({ yaw: Math.PI / 2 }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    await page.keyboard.up('KeyW');
    const p = await g(() => window.__mistwoodDebug.playerState());
    assert.ok(p.x > gx + 0.5, `走到 x = ${p.x.toFixed(2)}（入口 ${gx}）`);
    assert.ok((await bossState()) !== null, '戰鬥不該結束');
  });

  await check('還有迷霧時打不倒（最多剩 1），按 E 把水引進水槽後迷霧退去一層', async () => {
    const b = await bossState();
    // 直接送攻擊指令（不帶姿態）：連續被打時苔咚會縮入菌傘減傷，這裡只驗證護盾的下限
    for (let i = 0; i < 200; i++) await send({ type: 'AttackEnemy', enemyId: b.enemyId, attack: 'spell_starlight_burst' });
    await page.waitForTimeout(200);
    assert.equal((await bossState()).hp, 1);
    const trough = P(boss.troughs[0]);
    const [tx, tz] = [trough.position[0], trough.position[2]];
    // 從菌樹那一側（水槽的 +Z 面）走近
    const yaw = trough.rotation[1];
    await teleport(tx + Math.sin(yaw) * 1.6, tz + Math.cos(yaw) * 1.6, 600);
    await g(([x, z]) => window.__mistwoodDebug.face(x, z), [tx, tz]);
    await page.waitForFunction((id) => window.__mistwoodDebug.interactTarget() === id, boss.troughs[0], { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.querySelector('[data-testid="boss-bar"]')?.getAttribute('data-filled') === '1', null, { timeout: 3000 });
    assert.equal((await objectState(boss.troughs[0]))?.active, true);
    assert.notEqual(await interactTarget(), boss.troughs[0], '注過水的水槽不能再互動');
  });

  await check('根刺：站在標記上被打到；跳躍震地：起跳後跑開就躲得掉', async () => {
    await teleport(CX - 10, CZ + 6, 500);
    await heal();
    await page.waitForTimeout(300);
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('spikes'));
    await waitBoss('spikes', 8000);
    const before = await hp();
    await page.waitForFunction((h) => window.__mistwoodDebug.combatState().hp < h, before, { timeout: (boss.moves.spikes.windup + 1) * 1000 });
    assert.equal(before - (await hp()), boss.moves.spikes.damage);
    await setPeaceful(true);
    await waitBoss('chase');
    await heal();
    await page.waitForTimeout(800);
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('slam'));
    await waitBoss('slam', 8000);
    const target = (await bossState()).slamTo;
    // 跑到落點的另一邊、震波範圍外（仍在戰場內）
    const away = Math.atan2(target.z - CZ, target.x - CX) + Math.PI;
    await teleport(CX + Math.cos(away) * 14, CZ + Math.sin(away) * 14, 100);
    const safe = await hp();
    await waitBoss('recover', 4000);
    await page.waitForTimeout(200);
    assert.equal(await hp(), safe, '躲開了還是被打到');
    await setPeaceful(true);
  });

  await check('睡眠孢子：吹到時扣血並昏昏欲睡（走得很慢）', async () => {
    await waitBoss('chase', 5000);
    const b = await bossState();
    await teleport(b.x - 4, b.z, 300);
    await heal();
    await page.waitForTimeout(300);
    await setPeaceful(false);
    await g(() => window.__mistwoodDebug.forceBossMove('spores'));
    await page.waitForFunction(() => window.__mistwoodDebug.playerSlow().remaining > 0, null, { timeout: (boss.moves.spores.windup + 3) * 1000 });
    const slow = await g(() => window.__mistwoodDebug.playerSlow());
    assert.equal(slow.scale, boss.moves.spores.slowScale);
    assert.ok((await g(() => window.__mistwoodDebug.toasts())).some((t) => t.textKey === 'combat.sleepy'));
    await setPeaceful(true);
  });

  await check('倒下後在入口外重新站起來，苔咚回去、已注水的水槽保留；再走進去重新開戰（滿血）', async () => {
    const b = await bossState();
    for (let i = 0; i < 6; i++) await send({ type: 'EnemyStrike', enemyId: b.enemyId, move: 'slam' });
    await page.waitForFunction(() => window.__mistwoodDebug.combatState().defeated === false && window.__mistwoodDebug.boss() === null, null, { timeout: 10_000 });
    await page.waitForTimeout(800);
    const p = await g(() => window.__mistwoodDebug.playerState());
    assert.ok(Math.hypot(p.x - boss.retryAt[0], p.z - boss.retryAt[1]) < 2, `重新站起來的位置 ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
    assert.equal((await objectState(boss.troughs[0]))?.active, true);
    await teleport(CX - 12, CZ, 800);
    const again = await bossState();
    assert.ok(again && again.enemyId !== b.enemyId);
    assert.equal(again.hp, def.maxHp);
    assert.equal(again.filled, 1);
  });

  await check('三個水槽都注滿後打得倒：掉落苔冠菌帽、入口打開、不再開戰', async () => {
    await waitBoss('chase', (boss.introSec + 2) * 1000);
    for (const id of boss.troughs.slice(1)) await send({ type: 'ActivateObject', placementId: id });
    await page.waitForFunction(() => document.querySelector('[data-testid="boss-bar"]')?.getAttribute('data-filled') === '3', null, { timeout: 3000 });
    const b = await bossState();
    for (let i = 0; i < 60 && (await bossState()); i++) await send({ type: 'AttackEnemy', enemyId: b.enemyId, attack: 'spell_starlight_burst' });
    assert.equal(await bossState(), null);
    assert.deepEqual(await g(() => window.__mistwoodDebug.defeatedBosses()), ['boss_moss_thump']);
    assert.equal(await itemCount('moss_cap'), 1);
    await hud.waitFor({ state: 'detached', timeout: 2000 });
    // 入口的樹根沉下去：走得出去
    const [gx, gz] = boss.gate.center;
    await teleport(gx + 5, gz, 1200);
    await g(() => window.__mistwoodDebug.camera({ yaw: Math.PI / 2 }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    const p = await g(() => window.__mistwoodDebug.playerState());
    assert.ok(p.x < gx - 1, `走到 x = ${p.x.toFixed(2)}`);
    await teleport(CX - 12, CZ, 1500);
    assert.equal(await bossState(), null);
    const save = JSON.parse(await g(() => window.__mistwoodDebug.exportSave()));
    assert.deepEqual(save.combat.defeatedBosses, ['boss_moss_thump']);
  });
});
