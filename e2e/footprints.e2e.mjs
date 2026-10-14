// 端對端：任務 7L — quest_dawn_006「河邊的腳印」（Bible §22.1）。
// 燈塔點亮後在碎光溪邊按 E 調查腳印（自動開始任務）→ 按 E 摘野果 → 在小窩放下野果 → 馬上觀察太早（提示）→
// 時間過去後回來悄悄觀察 → 任務自動完成、拿到軟足印吊飾、角兔幼崽住在河邊（泡泡音）。
// 用法：pnpm build && node e2e/footprints.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const npcs = JSON.parse(readFileSync('src/data/npcs.json', 'utf8'));

const Q = 'quest_dawn_006';
const P = (id) => placements.find((p) => p.id === id);

await runE2e('footprints e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport, itemCount, objectState }) => {
  const toasts = () => debug(() => window.__mistwoodDebug.toasts().map((t) => t.textKey));
  const press = async (id, side = [1, 0.3], distance = 1.2) => {
    const p = P(id);
    const len = Math.hypot(side[0], side[1]);
    await teleport(p.position[0] + (side[0] / len) * distance, p.position[2] + (side[1] / len) * distance, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [p.position[0], p.position[2]]);
    await page.waitForFunction((t) => window.__mistwoodDebug.interactTarget() === t, id, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
  };

  await debug(() => window.__mistwoodDebug.setQuestCompleted('quest_dawn_003'));

  await check('按 E 調查腳印：任務自動開始', async () => {
    await press('river_footprints_01');
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
  });

  await check('按 E 摘兩顆野果、放在小窩旁', async () => {
    await press('river_berry_bush_01');
    await press('river_berry_bush_02');
    assert.equal(await itemCount('wild_berry'), 2);
    await press('river_nest_01');
    assert.equal((await objectState('river_nest_01'))?.active, true);
    assert.equal(await itemCount('wild_berry'), 0);
  });

  await check('馬上觀察：提示先離開一陣子', async () => {
    await press('river_bunny_hide_01', [-1, 0.2], 1.4);
    assert.ok((await toasts()).includes('toast.tooSoon'));
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'active');
  });

  await check('時間過去後回來悄悄觀察：任務完成、軟足印吊飾、角兔幼崽出現', async () => {
    await teleport(60, 30, 400);
    await debug(() => window.__mistwoodDebug.setClock(14));
    await page.waitForTimeout(300);
    await press('river_bunny_hide_01', [-1, 0.2], 1.4);
    assert.equal(await debug((q) => window.__mistwoodDebug.questState(q), Q), 'completed');
    assert.equal(await itemCount('soft_footprint_charm'), 1);
    await page.waitForFunction(() => window.__mistwoodDebug.npcState('horn_bunny') !== null, null, { timeout: 2000 });
    const before = await debug(() => window.__mistwoodDebug.audio().played.bubble ?? 0);
    const [bx, bz] = npcs.find((n) => n.id === 'horn_bunny').position;
    await teleport(bx + 1.2, bz - 0.4, 700);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [bx, bz]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'npc:horn_bunny', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid="dialogue"]').waitFor({ timeout: 2000 });
    assert.equal((await debug(() => window.__mistwoodDebug.dialogue())).dialogueId, 'horn_bunny_idle');
    assert.ok((await debug(() => window.__mistwoodDebug.audio().played.bubble ?? 0)) > before);
  });
});
