// 端對端：任務 7C — 多樣的怪物（Quaternius Ultimate Monsters，CC0）：每一種都會在自己的區域生成、以骨架動畫模型呈現；
// 被打會扣血並播放受擊動作、被擊敗時播放倒地動作後消失、依掉落表給物品；非和平模式會追擊並攻擊玩家；
// 迷霧清除後迷霧生物（霧魂）消散，野生的怪物（荊棘噗啾）留下。外觀以截圖檢查（--monsters）。
// 用法：pnpm build && node e2e/monsters.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runE2e } from './lib.mjs';

const enemies = JSON.parse(readFileSync('src/data/enemies.json', 'utf8'));
const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
// 分裂出來的小怪（沒有生成點，只由母體分裂出來）不在這裡測，由各自的母體測試覆蓋
const splitChildren = new Set(enemies.map((e) => e.splitInto?.enemy).filter(Boolean));
// 頭目只能在戰場裡生成（手動生成點），由各自的頭目套件測試
const modelEnemies = enemies.filter((e) => e.model && !e.boss && !splitChildren.has(e.id));
const spawnerOf = (kind) => spawners.find((s) => s.enemy === kind);

await runE2e('monsters e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount }) => {
  const list = () => debug(() => window.__mistwoodDebug.enemies());
  const waitFor = (kind, timeout = 25_000) =>
    page.waitForFunction((k) => window.__mistwoodDebug.enemies().some((e) => e.kind === k && e.anim), kind, { timeout });
  const goTo = async (kind) => {
    const sp = spawnerOf(kind);
    await teleport(sp.center[0], sp.center[1] + sp.radius + 6, 300);
    await waitFor(kind);
    return (await list()).find((e) => e.kind === kind);
  };

  await check(`至少 10 種模型怪物（目前 ${modelEnemies.length} 種），每一種都會生成並播放骨架動畫`, async () => {
    assert.ok(modelEnemies.length >= 10);
    const missing = [];
    for (const e of modelEnemies) {
      try {
        const found = await goTo(e.id);
        const clips = Object.values(e.model.clips);
        assert.ok(clips.includes(found.anim), `${e.id} 播放的動畫 ${found.anim} 不在資料內`);
      } catch (err) {
        missing.push(`${e.id}：${err.message.split('\n')[0]}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  await check('打中模型怪物：扣血並播放受擊動作；擊敗後播放倒地動作、從權威狀態移除', async () => {
    const def = enemies.find((e) => e.id === 'mob_marsh_frog');
    const target = await goTo(def.id);
    await debug((id) => window.__mistwoodDebug.send({ type: 'AttackEnemy', enemyId: id, attack: 'sword_slash_diag' }), target.id);
    await page.waitForFunction(
      ([id, clip]) => window.__mistwoodDebug.enemies().find((e) => e.id === id)?.anim === clip,
      [target.id, def.model.clips.hit],
      { timeout: 2000 },
    );
    const hurt = (await list()).find((e) => e.id === target.id);
    assert.ok(hurt.hp < def.maxHp, `血量 ${hurt.hp}`);
    for (let i = 0; i < 10 && (await debug((id) => window.__mistwoodDebug.enemyKnown(id), target.id)); i++) {
      await debug((id) => window.__mistwoodDebug.send({ type: 'AttackEnemy', enemyId: id, attack: 'sword_slash_diag' }), target.id);
      await page.waitForTimeout(30);
    }
    assert.equal(await debug((id) => window.__mistwoodDebug.enemyKnown(id), target.id), false, '沒有被擊敗');
    await page.waitForFunction(
      ([id, clip]) => window.__mistwoodDebug.enemyAnim(id) === clip,
      [target.id, def.model.clips.death],
      { timeout: 2000 },
    );
    // 倒地動作播完後淡出、移除
    await page.waitForFunction((id) => window.__mistwoodDebug.enemyAnim(id) === null, target.id, { timeout: 4000 });
  });

  await check('蘑菇王（頭目級）：血量高，擊敗後固定掉落星光碎屑 3–4 個', async () => {
    const def = enemies.find((e) => e.id === 'mob_mushroom_king');
    assert.ok(def.maxHp >= 300);
    const king = await goTo(def.id);
    const before = await itemCount('starlight_shard');
    for (let i = 0; i < 40 && (await list()).some((e) => e.id === king.id); i++) {
      await debug((id) => window.__mistwoodDebug.send({ type: 'AttackEnemy', enemyId: id, attack: 'sword_chop' }), king.id);
      await page.waitForTimeout(40);
    }
    assert.equal((await list()).some((e) => e.id === king.id), false, '蘑菇王沒有被擊敗');
    const gained = (await itemCount('starlight_shard')) - before;
    assert.ok(gained >= 3 && gained <= 4, `星光碎屑 +${gained}`);
  });

  await check('迷霧清除：霧魂消散，野生的荊棘噗啾仍在', async () => {
    await goTo('mob_mist_ghost');
    await goTo('mob_thorn_puff');
    await debug(() => window.__mistwoodDebug.setMistStage('ruins', 'clear'));
    await page.waitForFunction(() => !window.__mistwoodDebug.enemies().some((e) => e.kind === 'mob_mist_ghost'), null, { timeout: 8000 });
    await page.waitForTimeout(4000);
    assert.ok((await list()).some((e) => e.kind === 'mob_thorn_puff'), '荊棘噗啾也消失了');
  });

  await check('非和平模式：角角龍追擊並攻擊玩家，玩家扣血', async () => {
    const dino = await goTo('mob_horn_dino');
    await debug(() => window.__mistwoodDebug.setPeaceful(false));
    await teleport(dino.x + 3, dino.z, 200);
    const hp0 = (await debug(() => window.__mistwoodDebug.combatState())).hp;
    await page.waitForFunction((h) => window.__mistwoodDebug.combatState().hp < h, hp0, { timeout: 10_000 });
    const hit = (await list()).find((e) => e.kind === 'mob_horn_dino' && (e.state === 'chase' || e.state === 'attack'));
    assert.ok(hit, '角角龍沒有追擊');
    await debug(() => window.__mistwoodDebug.setPeaceful(true));
  });
});
