// 端對端：任務 3C — 任務系統與第一個任務（修橋用的木材）：對話接取 → 追蹤進度 → 回報交出物品 → 獎勵 → 存檔。
// 用法：pnpm build && node e2e/quest.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { placements, runE2e, SAVE_VERSION, tempSaveDir } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));
const balu = npcs.find((n) => n.id === 'balu');
const saveDir = tempSaveDir();
const trees = placements.filter((p) => p.prefabId.startsWith('tree_')).slice(0, 4).map((p) => p.id);

await runE2e('quest e2e', { env: { MISTWOOD_SAVE_DIR: saveDir } }, async ({ page, check, debug, teleport, itemCount }) => {
  const box = page.locator('[data-testid="dialogue"]');
  const tracker = page.locator('[data-testid="quest-tracker"] [data-quest="wood_for_bridge"]');
  const node = () => debug(() => window.__mistwoodDebug.dialogue()?.nodeId ?? null);
  const quest = () => debug(() => window.__mistwoodDebug.questState('wood_for_bridge'));
  const [bx, bz] = balu.position;
  const talkToBalu = async () => {
    await teleport(bx + Math.sin(balu.facingYaw) * 1.8, bz + Math.cos(balu.facingYaw) * 1.8, 500);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:balu', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await box.waitFor({ timeout: 2000 });
  };

  await check('與巴魯對話，選「我來幫你找木材！」接取任務', async () => {
    assert.equal(await quest(), 'available');
    await talkToBalu();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__mistwoodDebug.dialogue()?.nodeId === 'bridge');
    await page.locator('[data-testid="dialogue-option"]', { hasText: '我來幫你找木材' }).click();
    assert.equal(await node(), 'accept');
    assert.equal(await quest(), 'active');
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'toast.questAccepted'), JSON.stringify(toasts));
    await page.keyboard.press('Space');
    await box.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('任務追蹤顯示「修橋用的木材」與進度 0 / 6', async () => {
    await tracker.waitFor({ timeout: 2000 });
    assert.match(await tracker.innerText(), /修橋用的木材/);
    assert.equal((await tracker.locator('[data-testid="quest-progress"]').innerText()).replace(/\s/g, ''), '0/6');
  });

  await check('任務進行中再找巴魯：提醒還需要木材', async () => {
    await talkToBalu();
    assert.equal(await node(), 'remind');
    await page.keyboard.press('Escape');
  });

  await check('砍樹收集木材，進度更新；湊齊後提示回報', async () => {
    for (const id of trees) {
      await debug((pid) => window.__mistwoodDebug.send({ type: 'HarvestObject', placementId: pid }), id);
      if ((await itemCount('wood')) >= 6) break;
    }
    const wood = await itemCount('wood');
    assert.ok(wood >= 6, `木材 ${wood}`);
    assert.equal((await tracker.locator('[data-testid="quest-progress"]').innerText()).replace(/\s/g, ''), '6/6');
    assert.equal(await tracker.getAttribute('data-ready'), 'true');
    assert.match(await tracker.innerText(), /回去找木匠巴魯回報/);
  });

  await check('回報：交出 6 根木材、獲得星光碎片、任務完成、追蹤消失', async () => {
    const woodBefore = await itemCount('wood');
    await talkToBalu();
    assert.equal(await node(), 'wow');
    await page.keyboard.press('Digit1');
    assert.equal(await node(), 'thanks');
    assert.equal(await quest(), 'completed');
    assert.equal(await itemCount('wood'), woodBefore - 6);
    assert.equal(await itemCount('starlight_shard'), 1);
    const toasts = await debug(() => window.__mistwoodDebug.toasts());
    assert.ok(toasts.some((t) => t.textKey === 'toast.questCompleted'));
    assert.ok(toasts.some((t) => t.textKey === 'toast.itemsGiven'));
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await box.waitFor({ state: 'detached', timeout: 2000 });
    assert.equal(await tracker.count(), 0);
  });

  await check('完成後巴魯提出下一個任務（修橋）；不能再領一次獎勵', async () => {
    assert.equal(await debug(() => window.__mistwoodDebug.questState('repair_bridge')), 'available');
    await talkToBalu();
    assert.equal(await node(), 'plan');
    await page.keyboard.press('Escape');
    await debug(() => window.__mistwoodDebug.send({ type: 'TurnInQuest', quest: 'wood_for_bridge' }));
    assert.equal(await itemCount('starlight_shard'), 1);
  });

  await check('任務完成後自動存檔，存檔內任務為已完成', async () => {
    await page.waitForTimeout(2600);
    const file = JSON.parse(readFileSync(path.join(saveDir, 'slot1.json'), 'utf8'));
    assert.equal(file.version, SAVE_VERSION);
    assert.deepEqual(file.quests.wood_for_bridge, { status: 'completed' });
  });
});
