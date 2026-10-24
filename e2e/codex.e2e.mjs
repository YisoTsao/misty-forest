// 端對端：圖鑑（第二章規格 §11.3）。
// 按 K 打開圖鑑、Esc 關閉；讀倒流溪谷的石碑解鎖記錄（提示「圖鑑新增」）；打到幻霧螢靈解鎖生物；取得素材解鎖素材與來源；
// 圖鑑畫面上已解鎖的條目顯示名稱與內容，還沒解鎖的顯示「？？？」；暫停選單也能打開。截圖 docs/screenshots/phase13/codex.png。
// 用法：pnpm build && node e2e/codex.e2e.mjs
/* global window */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { placements, runE2e } from './lib.mjs';

const spawners = JSON.parse(readFileSync('src/data/spawners.json', 'utf8'));
const at = (id) => placements.find((p) => p.id === id);

await runE2e('codex e2e', { query: 'debug=1&play=1&peaceful=1' }, async ({ page, check, debug, teleport }) => {
  const panel = page.locator('[data-testid="codex"]');
  const unlocked = () => debug(() => window.__mistwoodDebug.codex());
  const send = (cmd) => debug((c) => window.__mistwoodDebug.send(c), cmd);
  const toast = (key) => page.waitForFunction((k) => window.__mistwoodDebug.toasts().some((x) => x.textKey === k), key, { timeout: 3000 });

  await check('一開始圖鑑是空的；按 K 打開，全部顯示「？？？」，Esc 關閉', async () => {
    assert.deepEqual(await unlocked(), []);
    await page.keyboard.press('KeyK');
    await panel.waitFor({ timeout: 2000 });
    assert.equal(await page.locator('[data-testid="codex-entry"][data-unlocked="true"]').count(), 0);
    assert.match(await page.locator('[data-testid="codex-progress"]').innerText(), /0 \/ \d+/);
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 2000 });
  });

  await check('讀倒流溪谷的石碑：解鎖記錄並提示', async () => {
    const tablet = at('creek_tablet');
    await teleport(tablet.position[0] + 1.6, tablet.position[2] + 1.2, 800);
    await debug(([x, z]) => window.__mistwoodDebug.face(x, z), [tablet.position[0], tablet.position[2]]);
    await page.waitForFunction(() => window.__mistwoodDebug.interactTarget() === 'creek_tablet', null, { timeout: 3000 });
    await page.keyboard.press('KeyE');
    const dialog = page.locator('[data-testid="message-dialog"]');
    await dialog.waitFor({ timeout: 2000 });
    await page.keyboard.press('KeyE');
    await dialog.waitFor({ state: 'detached', timeout: 2000 });
    await toast('toast.codexUnlocked');
    assert.ok((await unlocked()).includes('lore_creek_tablet'));
  });

  await check('打到幻霧螢靈解鎖生物；取得素材解鎖素材', async () => {
    const s = spawners.find((x) => x.id === 'deep_wisps');
    await teleport(s.center[0], s.center[1] + s.radius + 6, 300);
    await page.waitForFunction(() => window.__mistwoodDebug.enemies().some((e) => e.kind === 'mob_fog_wisp'), null, { timeout: 30000 });
    const wisp = await debug(() => window.__mistwoodDebug.enemies().find((e) => e.kind === 'mob_fog_wisp'));
    await debug((id) => window.__mistwoodDebug.hitEnemy(id, 'spell_starlight_burst'), wisp.id);
    await page.waitForFunction(() => window.__mistwoodDebug.codex().includes('creature_fog_wisp'), null, { timeout: 3000 });
    await send({ type: 'DebugGiveItems', items: [{ itemId: 'mist_fang', count: 1 }] });
    assert.ok((await unlocked()).includes('material_mist_fang'));
    await teleport(1880, 2, 300);
  });

  await check('從暫停選單打開圖鑑：已解鎖的條目顯示名稱與內容，素材有取得方式', async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="pause-menu"]').waitFor({ timeout: 2000 });
    await page.locator('[data-testid="pause-codex"]').click();
    await panel.waitFor({ timeout: 2000 });
    const wisp = page.locator('[data-testid="codex-entry"][data-entry="creature_fog_wisp"]');
    assert.equal(await wisp.getAttribute('data-unlocked'), 'true');
    await wisp.click();
    const detail = page.locator('[data-testid="codex-detail"]');
    assert.match(await detail.innerText(), /幻霧螢靈[\s\S]*棲息地[\s\S]*螢光提燈/);
    await page.locator('[data-testid="codex-tab-material"]').click();
    await page.locator('[data-testid="codex-entry"][data-entry="material_mist_fang"]').click();
    assert.match(await detail.innerText(), /霧紋獸牙[\s\S]*取得方式[\s\S]*森林狼/);
    await page.locator('[data-testid="codex-tab-lore"]').click();
    await page.locator('[data-testid="codex-entry"][data-entry="lore_creek_tablet"]').click();
    assert.match(await detail.innerText(), /讓木輪認得上游/);
    // 還沒解鎖的條目
    await page.locator('[data-testid="codex-entry"][data-entry="lore_star_tablet"]').click();
    assert.match(await detail.innerText(), /？？？/);
    assert.match(await page.locator('[data-testid="codex-progress"]').innerText(), /3 \/ \d+/);
    mkdirSync('docs/screenshots/phase13', { recursive: true });
    await page.locator('[data-testid="codex-tab-creature"]').click();
    await wisp.click();
    await page.screenshot({ path: 'docs/screenshots/phase13/codex.png' });
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached', timeout: 2000 });
  });
});
